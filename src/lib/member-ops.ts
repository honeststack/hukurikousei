import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { audit, type Actor } from "./audit";
import { revokeAllSessions, sendMemberInvite } from "./auth";
import { rolloverMemberById } from "./ledger";
import { applyImport, type ImportPlan } from "./members";
import { jstDate } from "./time";

/** 招待メールを送る（パスワード設定済みの会員には送らない） */
export async function inviteMembers(memberIds: string[], actor: Actor) {
  const db = await getDb();
  let sent = 0;
  for (const id of memberIds) {
    const [row] = await db
      .select({ m: schema.members, companyName: schema.companies.name })
      .from(schema.members)
      .innerJoin(schema.companies, eq(schema.companies.id, schema.members.companyId))
      .where(and(eq(schema.members.id, id), isNull(schema.members.passwordHash)));
    if (!row) continue;
    if (row.m.stopsOn && row.m.stopsOn <= jstDate(new Date())) continue;
    await sendMemberInvite(row.m, row.companyName);
    sent++;
  }
  if (sent) await audit(actor, "member.invite", "member", memberIds.length === 1 ? memberIds[0] : "", { sent }, db);
  return sent;
}

/** 登録・変更の後処理。停止日を過ぎていればログアウトさせ、当月の付与・無効化を反映する。 */
export async function afterMemberSaved(memberId: string) {
  const db = await getDb();
  const [m] = await db.select().from(schema.members).where(eq(schema.members.id, memberId));
  if (!m) return;
  const today = jstDate(new Date());
  if (m.stopsOn && m.stopsOn <= today) await revokeAllSessions("member", m.id);
  await db.transaction((tx) => rolloverMemberById(tx, m.id, new Date()));
}

export async function applyImportAndInvite(importId: string, companyId: string, actor: Actor, sendInvites: boolean) {
  const db = await getDb();
  const [imp] = await db
    .select()
    .from(schema.memberImports)
    .where(and(eq(schema.memberImports.id, importId), eq(schema.memberImports.companyId, companyId)));
  if (!imp || imp.status !== "preview") return { ok: false as const, message: "この取り込みはすでに反映済みか、取り消されています" };
  const plan = imp.plan as ImportPlan;
  const created = await applyImport(db, companyId, plan, actor);
  await db.update(schema.memberImports).set({ status: "applied", appliedAt: new Date() }).where(eq(schema.memberImports.id, imp.id));
  const touched = [
    ...created.map((m) => m.id),
    ...plan.rows.filter((r) => r.memberId && (r.action === "update" || r.action === "stop")).map((r) => r.memberId!),
    ...(plan.missingAction === "stop" ? plan.missing.map((m) => m.memberId) : []),
  ];
  for (const id of touched) await afterMemberSaved(id);
  const invited = sendInvites ? await inviteMembers(created.map((m) => m.id), actor) : 0;
  return { ok: true as const, created: created.length, invited, counts: plan.counts };
}
