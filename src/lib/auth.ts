import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { hashPassword, randomToken, sha256, verifyPassword } from "./crypto";
import { getSettings } from "./settings";
import { appUrl, sendMail } from "./mail";
import type { Actor } from "./audit";

export const MEMBER_COOKIE = "yf_m";
export const STAFF_COOKIE = "yf_s";
export const DEVICE_COOKIE = "yf_d";

const MEMBER_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const STAFF_TTL_MS = 12 * 60 * 60 * 1000;
const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60 * 1000;

type SubjectKind = "member" | "staff";

const secure = () => process.env.NODE_ENV === "production" || (process.env.APP_URL ?? "").startsWith("https://");

export async function requestMeta() {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "";
  return { ip, userAgent: (h.get("user-agent") ?? "").slice(0, 300) };
}

/** 端末ID（長期Cookie）。不正検知と同時ログイン端末数の管理に使う。 */
export async function ensureDeviceId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(DEVICE_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{16,64}$/.test(existing)) return existing;
  const id = randomToken(16);
  jar.set(DEVICE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: 60 * 60 * 24 * 730 });
  return id;
}

export async function readDeviceId(): Promise<string> {
  return (await cookies()).get(DEVICE_COOKIE)?.value ?? "";
}

async function createSession(kind: SubjectKind, subjectId: string, opts: { mfaPending?: boolean } = {}) {
  const db = await getDb();
  const token = randomToken(32);
  const meta = await requestMeta();
  const deviceId = await ensureDeviceId();
  const ttl = kind === "member" ? MEMBER_TTL_MS : STAFF_TTL_MS;
  await db.insert(schema.sessions).values({
    id: sha256(token),
    subjectKind: kind,
    subjectId,
    deviceId,
    mfaPending: opts.mfaPending ?? false,
    userAgent: meta.userAgent,
    ip: meta.ip,
    expiresAt: new Date(Date.now() + ttl),
  });
  (await cookies()).set(kind === "member" ? MEMBER_COOKIE : STAFF_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secure(),
    path: "/",
    maxAge: Math.floor(ttl / 1000),
  });
  if (kind === "member") {
    // 同時ログイン端末数の上限を超えた古いセッションを終了する
    const { maxMemberDevices } = await getSettings();
    const live = await db
      .select({ id: schema.sessions.id })
      .from(schema.sessions)
      .where(
        and(
          eq(schema.sessions.subjectKind, "member"),
          eq(schema.sessions.subjectId, subjectId),
          isNull(schema.sessions.revokedAt),
          gt(schema.sessions.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(schema.sessions.lastSeenAt), desc(schema.sessions.createdAt));
    for (const s of live.slice(Math.max(1, maxMemberDevices))) {
      await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, s.id));
    }
  }
}

async function loadSession(kind: SubjectKind) {
  const token = (await cookies()).get(kind === "member" ? MEMBER_COOKIE : STAFF_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [s] = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, sha256(token)), eq(schema.sessions.subjectKind, kind)));
  if (!s || s.revokedAt || s.expiresAt < new Date()) return null;
  // 最終利用の更新（1時間に1回まで）。会員はスライド式に期限を延長。
  if (Date.now() - s.lastSeenAt.getTime() > 60 * 60 * 1000) {
    const ttl = kind === "member" ? MEMBER_TTL_MS : STAFF_TTL_MS;
    await db
      .update(schema.sessions)
      .set({ lastSeenAt: new Date(), expiresAt: new Date(Date.now() + ttl) })
      .where(eq(schema.sessions.id, s.id));
  }
  return s;
}

export async function endSession(kind: SubjectKind) {
  const jar = await cookies();
  const name = kind === "member" ? MEMBER_COOKIE : STAFF_COOKIE;
  const token = jar.get(name)?.value;
  if (token) {
    const db = await getDb();
    await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, sha256(token)));
  }
  jar.delete(name);
}

export async function revokeAllSessions(kind: SubjectKind, subjectId: string) {
  const db = await getDb();
  await db
    .update(schema.sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.sessions.subjectKind, kind), eq(schema.sessions.subjectId, subjectId), isNull(schema.sessions.revokedAt)));
}

/* ───────── 会員 ───────── */

export type CurrentMember = typeof schema.members.$inferSelect & { companyName: string };

export const getCurrentMember = cache(async (): Promise<CurrentMember | null> => {
  const s = await loadSession("member");
  if (!s) return null;
  const db = await getDb();
  const [row] = await db
    .select({ m: schema.members, companyName: schema.companies.name })
    .from(schema.members)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.members.companyId))
    .where(eq(schema.members.id, s.subjectId));
  if (!row) return null;
  return { ...row.m, companyName: row.companyName };
});

export async function requireMember(next?: string): Promise<CurrentMember> {
  const m = await getCurrentMember();
  if (!m) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return m;
}

export function memberActor(m: { id: string; name: string }, ip = ""): Actor {
  return { kind: "member", id: m.id, name: m.name, ip };
}

type LoginResult = { ok: true } | { ok: false; error: string };

const GENERIC_LOGIN_ERROR = "メールアドレスまたはパスワードが違います";

export async function loginMember(email: string, password: string): Promise<LoginResult> {
  const db = await getDb();
  const [m] = await db
    .select()
    .from(schema.members)
    .where(sql`lower(${schema.members.email}) = ${email.trim().toLowerCase()}`);
  if (!m || !m.passwordHash) {
    await verifyPassword(password, "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86)).catch(() => false);
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  if (m.lockedUntil && m.lockedUntil > new Date()) {
    return { ok: false, error: "続けて失敗したため、しばらくログインできません。15分ほどおいてからお試しください" };
  }
  const good = await verifyPassword(password, m.passwordHash);
  if (!good) {
    const failed = m.failedLogins + 1;
    await db
      .update(schema.members)
      .set({ failedLogins: failed >= LOCK_AFTER ? 0 : failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : null })
      .where(eq(schema.members.id, m.id));
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  await db
    .update(schema.members)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(schema.members.id, m.id));
  await createSession("member", m.id);
  return { ok: true };
}

/* ───────── 運営・企業・施設の担当者 ───────── */

export type StaffRole = (typeof schema.staffUsers.$inferSelect)["role"];
export type CurrentStaff = typeof schema.staffUsers.$inferSelect;

export const OPERATOR_ROLES: StaffRole[] = ["admin", "operator", "viewer"];

export const getStaffSession = cache(async () => {
  const s = await loadSession("staff");
  if (!s) return null;
  const db = await getDb();
  const [u] = await db.select().from(schema.staffUsers).where(eq(schema.staffUsers.id, s.subjectId));
  if (!u || !u.active) return null;
  return { session: s, user: u };
});

export const getCurrentStaff = cache(async (): Promise<CurrentStaff | null> => {
  const s = await getStaffSession();
  if (!s || s.session.mfaPending) return null;
  return s.user;
});

export function homeForRole(role: StaffRole): string {
  if (role === "company") return "/company";
  if (role === "facility") return "/facility";
  return "/admin";
}

export function mustSetup2fa(u: CurrentStaff): boolean {
  return process.env.REQUIRE_ADMIN_2FA === "true" && OPERATOR_ROLES.includes(u.role) && !u.totpEnabled;
}

/** 担当者を要求。roles に含まれない場合はそのロールのトップへ戻す。 */
export async function requireStaff(roles: StaffRole[]): Promise<CurrentStaff> {
  const s = await getStaffSession();
  if (!s) redirect("/staff/login");
  if (s.session.mfaPending) redirect("/staff/mfa");
  const u = s.user;
  if (mustSetup2fa(u)) redirect("/staff/2fa-setup");
  if (!roles.includes(u.role)) redirect(homeForRole(u.role));
  return u;
}

export function staffActor(u: { id: string; name: string }, ip = ""): Actor {
  return { kind: "staff", id: u.id, name: u.name, ip };
}

export async function loginStaff(email: string, password: string): Promise<LoginResult & { mfa?: boolean; role?: StaffRole }> {
  const db = await getDb();
  const [u] = await db
    .select()
    .from(schema.staffUsers)
    .where(sql`lower(${schema.staffUsers.email}) = ${email.trim().toLowerCase()}`);
  if (!u || !u.active || !u.passwordHash) {
    await verifyPassword(password, "scrypt$16384$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86)).catch(() => false);
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  if (u.lockedUntil && u.lockedUntil > new Date()) {
    return { ok: false, error: "続けて失敗したため、15分ほどログインできません" };
  }
  if (!(await verifyPassword(password, u.passwordHash))) {
    const failed = u.failedLogins + 1;
    await db
      .update(schema.staffUsers)
      .set({ failedLogins: failed >= LOCK_AFTER ? 0 : failed, lockedUntil: failed >= LOCK_AFTER ? new Date(Date.now() + LOCK_MS) : null })
      .where(eq(schema.staffUsers.id, u.id));
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }
  await db.update(schema.staffUsers).set({ failedLogins: 0, lockedUntil: null }).where(eq(schema.staffUsers.id, u.id));
  await createSession("staff", u.id, { mfaPending: u.totpEnabled });
  if (!u.totpEnabled) await db.update(schema.staffUsers).set({ lastLoginAt: new Date() }).where(eq(schema.staffUsers.id, u.id));
  return { ok: true, mfa: u.totpEnabled, role: u.role };
}

export async function completeMfa(): Promise<void> {
  const s = await getStaffSession();
  if (!s) return;
  const db = await getDb();
  await db.update(schema.sessions).set({ mfaPending: false }).where(eq(schema.sessions.id, s.session.id));
  await db.update(schema.staffUsers).set({ lastLoginAt: new Date() }).where(eq(schema.staffUsers.id, s.user.id));
}

/* ───────── 招待・パスワード再設定 ───────── */

export async function issueAuthToken(kind: "invite" | "reset", subjectKind: SubjectKind, subjectId: string): Promise<string> {
  const db = await getDb();
  const token = randomToken(24);
  const ttl = kind === "invite" ? 14 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
  await db.insert(schema.authTokens).values({
    id: sha256(token),
    kind,
    subjectKind,
    subjectId,
    expiresAt: new Date(Date.now() + ttl),
  });
  return token;
}

export async function peekAuthToken(token: string, kinds: ("invite" | "reset")[]) {
  const db = await getDb();
  const [t] = await db.select().from(schema.authTokens).where(eq(schema.authTokens.id, sha256(token)));
  if (!t || t.usedAt || t.expiresAt < new Date() || !kinds.includes(t.kind)) return null;
  return t;
}

/** トークンを使ってパスワードを設定し、そのままログインさせる */
export async function setPasswordWithToken(token: string, password: string): Promise<LoginResult & { subjectKind?: SubjectKind }> {
  const t = await peekAuthToken(token, ["invite", "reset"]);
  if (!t) return { ok: false, error: "このリンクは期限切れか、すでに使われています。お手数ですが再発行を依頼してください" };
  const db = await getDb();
  const hash = await hashPassword(password);
  const used = await db
    .update(schema.authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.authTokens.id, t.id), isNull(schema.authTokens.usedAt)))
    .returning();
  if (!used.length) return { ok: false, error: "このリンクはすでに使われています" };
  if (t.subjectKind === "member") {
    await db
      .update(schema.members)
      .set({ passwordHash: hash, failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(schema.members.id, t.subjectId));
    await revokeAllSessions("member", t.subjectId);
    await createSession("member", t.subjectId);
  } else {
    await db
      .update(schema.staffUsers)
      .set({ passwordHash: hash, failedLogins: 0, lockedUntil: null })
      .where(eq(schema.staffUsers.id, t.subjectId));
    await revokeAllSessions("staff", t.subjectId);
    const [u] = await db.select().from(schema.staffUsers).where(eq(schema.staffUsers.id, t.subjectId));
    await createSession("staff", t.subjectId, { mfaPending: u?.totpEnabled ?? false });
  }
  return { ok: true, subjectKind: t.subjectKind };
}

export async function sendMemberInvite(member: { id: string; name: string; email: string }, companyName: string) {
  const token = await issueAuthToken("invite", "member", member.id);
  const db = await getDb();
  await db.update(schema.members).set({ invitedAt: new Date() }).where(eq(schema.members.id, member.id));
  const s = await getSettings();
  await sendMail(
    member.email,
    "【湯札】会員証のご案内（初回設定のお願い）",
    `${member.name} 様

${companyName} の福利厚生として、提携の温浴施設をご利用いただける「湯札」の会員証をご用意しました。
下のリンクを開き、パスワードを決めると、スマートフォンに会員証が表示されます（14日間有効）。

${appUrl(`/invite/${token}`)}

・アプリのインストールは不要です。スマートフォンのブラウザで開いてください。
・毎月1日にポイントが付与され、施設のQRコードを読み取って入館します。

お問い合わせ: ${s.supportName} ${s.supportPhone}（${s.supportHours}）
`,
  );
}

export async function sendStaffInvite(user: { id: string; name: string; email: string }) {
  const token = await issueAuthToken("invite", "staff", user.id);
  await sendMail(
    user.email,
    "【湯札】管理画面アカウントのご案内",
    `${user.name} 様

湯札の管理画面アカウントを作成しました。下のリンクからパスワードを設定してください（14日間有効）。

${appUrl(`/staff/invite/${token}`)}
`,
  );
}

export async function requestPasswordReset(email: string, subjectKind: SubjectKind) {
  const db = await getDb();
  const e = email.trim().toLowerCase();
  if (subjectKind === "member") {
    const [m] = await db.select().from(schema.members).where(sql`lower(${schema.members.email}) = ${e}`);
    if (!m) return;
    const token = await issueAuthToken("reset", "member", m.id);
    await sendMail(
      m.email,
      "【湯札】パスワード再設定のご案内",
      `${m.name} 様\n\n下のリンクから新しいパスワードを設定してください（1時間有効）。\n\n${appUrl(`/reset/${token}`)}\n\nお心当たりがない場合は、このメールは破棄してください。\n`,
    );
  } else {
    const [u] = await db.select().from(schema.staffUsers).where(sql`lower(${schema.staffUsers.email}) = ${e}`);
    if (!u || !u.active) return;
    const token = await issueAuthToken("reset", "staff", u.id);
    await sendMail(
      u.email,
      "【湯札】管理画面パスワード再設定のご案内",
      `${u.name} 様\n\n下のリンクから新しいパスワードを設定してください（1時間有効）。\n\n${appUrl(`/staff/reset/${token}`)}\n`,
    );
  }
}

export async function changePassword(kind: SubjectKind, id: string, current: string, next: string): Promise<LoginResult> {
  const db = await getDb();
  const table = kind === "member" ? schema.members : schema.staffUsers;
  const [row] = await db.select({ hash: table.passwordHash }).from(table).where(eq(table.id, id));
  if (!row || !(await verifyPassword(current, row.hash))) return { ok: false, error: "現在のパスワードが違います" };
  await db.update(table).set({ passwordHash: await hashPassword(next) }).where(eq(table.id, id));
  return { ok: true };
}
