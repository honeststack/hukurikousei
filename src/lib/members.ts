/** 会員の登録・変更・CSV一括登録 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { schema, type DB, type Executor } from "@/db";
import { audit, type Actor } from "./audit";
import { normalizeDate, parseCsv } from "./csv";
import { isValidYmd } from "./time";

type Member = typeof schema.members.$inferSelect;

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const memberInput = z.object({
  employeeNo: z.string().trim().min(1, "社員番号を入力してください").max(40, "社員番号が長すぎます"),
  name: z.string().trim().min(1, "氏名を入力してください").max(60),
  nameKana: z.string().trim().max(60).default(""),
  email: z.string().trim().toLowerCase().regex(emailRe, "メールアドレスの形式が正しくありません"),
  department: z.string().trim().max(60).default(""),
  startsOn: z.string().refine(isValidYmd, "利用開始日を正しく入力してください"),
  stopsOn: z
    .string()
    .nullable()
    .refine((v) => v === null || isValidYmd(v), "利用停止日を正しく入力してください"),
});
export type MemberInput = z.infer<typeof memberInput>;

export function firstIssue(e: z.ZodError): string {
  return e.issues[0]?.message ?? "入力内容を確認してください";
}

async function emailTaken(ex: Executor, email: string, exceptId?: string) {
  const [m] = await ex.select({ id: schema.members.id }).from(schema.members).where(sql`lower(${schema.members.email}) = ${email.toLowerCase()}`);
  return !!m && m.id !== exceptId;
}

export async function createMember(
  db: DB,
  companyId: string,
  raw: unknown,
  actor: Actor,
): Promise<{ ok: true; member: Member } | { ok: false; message: string }> {
  const parsed = memberInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  if (v.stopsOn && v.stopsOn <= v.startsOn) return { ok: false, message: "利用停止日は利用開始日より後にしてください" };
  return db.transaction(async (tx) => {
    const [dup] = await tx
      .select({ id: schema.members.id })
      .from(schema.members)
      .where(and(eq(schema.members.companyId, companyId), eq(schema.members.employeeNo, v.employeeNo)));
    if (dup) return { ok: false as const, message: "この社員番号はすでに登録されています" };
    if (await emailTaken(tx, v.email)) return { ok: false as const, message: "このメールアドレスはすでに登録されています" };
    const [m] = await tx.insert(schema.members).values({ ...v, companyId }).returning();
    await audit(actor, "member.create", "member", m.id, { employeeNo: v.employeeNo, name: v.name }, tx);
    return { ok: true as const, member: m };
  });
}

export async function updateMember(
  db: DB,
  memberId: string,
  raw: unknown,
  actor: Actor,
): Promise<{ ok: true; member: Member } | { ok: false; message: string }> {
  const parsed = memberInput.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };
  const v = parsed.data;
  if (v.stopsOn && v.stopsOn <= v.startsOn) return { ok: false, message: "利用停止日は利用開始日より後にしてください" };
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(schema.members).where(eq(schema.members.id, memberId)).for("update");
    if (!before) return { ok: false as const, message: "会員が見つかりません" };
    const [dup] = await tx
      .select({ id: schema.members.id })
      .from(schema.members)
      .where(and(eq(schema.members.companyId, before.companyId), eq(schema.members.employeeNo, v.employeeNo)));
    if (dup && dup.id !== memberId) return { ok: false as const, message: "この社員番号は別の会員で使われています" };
    if (await emailTaken(tx, v.email, memberId)) return { ok: false as const, message: "このメールアドレスは別の会員で使われています" };
    const [m] = await tx.update(schema.members).set(v).where(eq(schema.members.id, memberId)).returning();
    await audit(actor, "member.update", "member", m.id, { before: pick(before), after: pick(m) }, tx);
    return { ok: true as const, member: m };
  });
}

function pick(m: Member) {
  return {
    employeeNo: m.employeeNo,
    name: m.name,
    nameKana: m.nameKana,
    email: m.email,
    department: m.department,
    startsOn: m.startsOn,
    stopsOn: m.stopsOn,
  };
}

export type MemberStatus = "invited" | "active" | "scheduled" | "stopped" | "not_started";

export function memberStatus(m: Pick<Member, "passwordHash" | "startsOn" | "stopsOn">, today: string): MemberStatus {
  if (m.stopsOn && m.stopsOn <= today) return "stopped";
  if (m.startsOn > today) return "not_started";
  if (!m.passwordHash) return "invited";
  if (m.stopsOn) return "scheduled";
  return "active";
}

export const MEMBER_STATUS_LABEL: Record<MemberStatus, string> = {
  invited: "未設定",
  active: "利用中",
  scheduled: "停止予定",
  stopped: "停止",
  not_started: "開始前",
};

/* ───────── CSV一括登録 ───────── */

const HEADER_ALIASES: Record<keyof MemberInput, string[]> = {
  employeeNo: ["社員番号", "従業員番号", "employee_no", "employeeno"],
  name: ["氏名", "名前", "name"],
  nameKana: ["フリガナ", "ふりがな", "氏名カナ", "kana", "name_kana"],
  email: ["メールアドレス", "メール", "email", "e-mail"],
  department: ["部署", "所属", "department"],
  startsOn: ["利用開始日", "開始日", "starts_on"],
  stopsOn: ["利用停止日", "停止日", "退職日", "stops_on"],
};

export const CSV_TEMPLATE_HEADER = ["社員番号", "氏名", "フリガナ", "メールアドレス", "部署", "利用開始日", "利用停止日"];

export type ImportRow = {
  line: number;
  employeeNo: string;
  name: string;
  action: "create" | "update" | "stop" | "unchanged" | "error";
  changes: string[];
  errors: string[];
  data?: MemberInput;
  memberId?: string;
};

export type ImportPlan = {
  rows: ImportRow[];
  missing: { memberId: string; employeeNo: string; name: string }[];
  missingAction: "keep" | "stop";
  stopDateForMissing: string | null;
  counts: { create: number; update: number; stop: number; unchanged: number; error: number; missingStop: number };
};

const FIELD_LABEL: Record<keyof MemberInput, string> = {
  employeeNo: "社員番号",
  name: "氏名",
  nameKana: "フリガナ",
  email: "メール",
  department: "部署",
  startsOn: "利用開始日",
  stopsOn: "利用停止日",
};

export async function planImport(
  ex: Executor,
  companyId: string,
  text: string,
  opts: { missingAction: "keep" | "stop"; today: string },
): Promise<{ ok: true; plan: ImportPlan } | { ok: false; message: string }> {
  const { header, rows } = parseCsv(text);
  if (!header.length) return { ok: false, message: "CSVが空です" };
  const norm = (s: string) => s.replace(/\s|　/g, "").toLowerCase();
  const col: Partial<Record<keyof MemberInput, number>> = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES) as [keyof MemberInput, string[]][]) {
    const idx = header.findIndex((h) => aliases.some((a) => norm(a) === norm(h)));
    if (idx >= 0) col[key] = idx;
  }
  const missingCols = (["employeeNo", "name", "email"] as const).filter((k) => col[k] === undefined).map((k) => FIELD_LABEL[k]);
  if (missingCols.length) return { ok: false, message: `見出し行に「${missingCols.join("」「")}」の列が見つかりません` };
  if (rows.length > 5000) return { ok: false, message: "一度に登録できるのは5,000行までです" };

  const existing = await ex.select().from(schema.members).where(eq(schema.members.companyId, companyId));
  const byNo = new Map(existing.map((m) => [m.employeeNo, m]));
  const allEmails = await ex.select({ id: schema.members.id, email: schema.members.email }).from(schema.members);
  const emailOwner = new Map(allEmails.map((r) => [r.email.toLowerCase(), r.id]));
  const seenNo = new Set<string>();
  const seenEmail = new Set<string>();
  const out: ImportRow[] = [];

  rows.forEach((r, i) => {
    const get = (k: keyof MemberInput) => (col[k] === undefined ? "" : (r[col[k] as number] ?? "").trim());
    const line = i + 2;
    const errors: string[] = [];
    const startsRaw = get("startsOn");
    const stopsRaw = get("stopsOn");
    const startsOn = startsRaw ? normalizeDate(startsRaw) : null;
    const stopsOn = stopsRaw ? normalizeDate(stopsRaw) : null;
    if (startsOn === "invalid") errors.push("利用開始日の形式が正しくありません（例: 2026/04/01）");
    if (stopsOn === "invalid") errors.push("利用停止日の形式が正しくありません（例: 2027/03/31）");
    const employeeNo = get("employeeNo");
    const current = byNo.get(employeeNo);
    const candidate = {
      employeeNo,
      name: get("name"),
      nameKana: col.nameKana === undefined ? current?.nameKana ?? "" : get("nameKana"),
      email: get("email"),
      department: col.department === undefined ? current?.department ?? "" : get("department"),
      startsOn: startsOn && startsOn !== "invalid" ? startsOn : current?.startsOn ?? opts.today,
      stopsOn: col.stopsOn === undefined ? current?.stopsOn ?? null : stopsOn === "invalid" ? null : stopsOn,
    };
    const parsed = memberInput.safeParse(candidate);
    if (!parsed.success) errors.push(...parsed.error.issues.map((x) => x.message));
    if (employeeNo && seenNo.has(employeeNo)) errors.push("同じ社員番号の行が重複しています");
    const email = candidate.email.toLowerCase();
    if (email && seenEmail.has(email)) errors.push("同じメールアドレスの行が重複しています");
    const owner = emailOwner.get(email);
    if (email && owner && owner !== current?.id) errors.push("このメールアドレスは別の会員で使われています");
    if (candidate.stopsOn && candidate.stopsOn <= candidate.startsOn) errors.push("利用停止日は利用開始日より後にしてください");
    seenNo.add(employeeNo);
    seenEmail.add(email);

    if (errors.length || !parsed.success) {
      out.push({ line, employeeNo, name: candidate.name, action: "error", changes: [], errors });
      return;
    }
    const data = parsed.data;
    if (!current) {
      out.push({ line, employeeNo, name: data.name, action: "create", changes: [], errors: [], data });
      return;
    }
    const before = pick(current);
    const changes = (Object.keys(FIELD_LABEL) as (keyof MemberInput)[])
      .filter((k) => (before[k] ?? null) !== (data[k] ?? null))
      .map((k) => `${FIELD_LABEL[k]}: ${before[k] ?? "なし"} → ${data[k] ?? "なし"}`);
    const action = !changes.length ? "unchanged" : data.stopsOn && data.stopsOn !== before.stopsOn ? "stop" : "update";
    out.push({ line, employeeNo, name: data.name, action, changes, errors: [], data, memberId: current.id });
  });

  const missing = existing
    .filter((m) => !seenNo.has(m.employeeNo) && (!m.stopsOn || m.stopsOn > opts.today))
    .map((m) => ({ memberId: m.id, employeeNo: m.employeeNo, name: m.name }));
  const count = (a: ImportRow["action"]) => out.filter((r) => r.action === a).length;
  return {
    ok: true,
    plan: {
      rows: out,
      missing,
      missingAction: opts.missingAction,
      stopDateForMissing: opts.missingAction === "stop" ? opts.today : null,
      counts: {
        create: count("create"),
        update: count("update"),
        stop: count("stop"),
        unchanged: count("unchanged"),
        error: count("error"),
        missingStop: opts.missingAction === "stop" ? missing.length : 0,
      },
    },
  };
}

/** プレビューした内容を反映する。エラー行は反映しない。新規の会員を返す（招待メール送信用）。 */
export async function applyImport(db: DB, companyId: string, plan: ImportPlan, actor: Actor) {
  return db.transaction(async (tx) => {
    const created: Member[] = [];
    for (const r of plan.rows) {
      if (!r.data) continue;
      if (r.action === "create") {
        const [m] = await tx.insert(schema.members).values({ ...r.data, companyId }).returning();
        created.push(m);
      } else if ((r.action === "update" || r.action === "stop") && r.memberId) {
        await tx
          .update(schema.members)
          .set(r.data)
          .where(and(eq(schema.members.id, r.memberId), eq(schema.members.companyId, companyId)));
      }
    }
    if (plan.missingAction === "stop" && plan.stopDateForMissing) {
      for (const m of plan.missing) {
        await tx
          .update(schema.members)
          .set({ stopsOn: plan.stopDateForMissing })
          .where(and(eq(schema.members.id, m.memberId), eq(schema.members.companyId, companyId)));
      }
    }
    await audit(actor, "member.import", "company", companyId, plan.counts, tx);
    return created;
  });
}
