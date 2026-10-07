/**
 * 施設への月次精算。仮集計 → 施設確認 → 確定（ロック）。
 * 確定後に取り消された入館は、取消した月の精算にマイナスの調整行として計上する。
 */
import { and, asc, eq, gte, inArray, or } from "drizzle-orm";
import { schema, type DB, type Executor } from "@/db";
import { audit, type Actor } from "./audit";
import { currentPeriod, type Period } from "./time";

export type Statement = typeof schema.statements.$inferSelect;

export const STATUS_LABEL: Record<Statement["status"], string> = {
  draft: "締め前",
  review: "確認中",
  closed: "確定",
};

export async function ensureStatement(ex: Executor, facilityId: string, period: Period): Promise<Statement> {
  await ex.insert(schema.statements).values({ facilityId, period }).onConflictDoNothing();
  const [st] = await ex
    .select()
    .from(schema.statements)
    .where(and(eq(schema.statements.facilityId, facilityId), eq(schema.statements.period, period)));
  return st;
}

/** 精算明細。確定済みの月は確定後に取り消された入館も含める（調整は翌月以降）。 */
export async function statementLines(ex: Executor, facilityId: string, period: Period, st?: Statement | null) {
  const closedAt = st?.status === "closed" ? st.closedAt : null;
  const statusCond = closedAt
    ? or(eq(schema.checkins.status, "active"), and(eq(schema.checkins.status, "cancelled"), gte(schema.checkins.cancelledAt, closedAt)))
    : eq(schema.checkins.status, "active");
  const checkins = await ex
    .select({
      c: schema.checkins,
      memberName: schema.members.name,
      employeeNo: schema.members.employeeNo,
      companyName: schema.companies.name,
    })
    .from(schema.checkins)
    .innerJoin(schema.members, eq(schema.members.id, schema.checkins.memberId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.checkins.companyId))
    .where(and(eq(schema.checkins.facilityId, facilityId), eq(schema.checkins.period, period), statusCond))
    .orderBy(asc(schema.checkins.checkedInAt));
  const adjustments = await ex
    .select()
    .from(schema.settlementAdjustments)
    .where(and(eq(schema.settlementAdjustments.facilityId, facilityId), eq(schema.settlementAdjustments.period, period)))
    .orderBy(asc(schema.settlementAdjustments.createdAt));
  const checkinAmount = checkins.reduce((s, r) => s + r.c.settlementAmount, 0);
  const adjustmentAmount = adjustments.reduce((s, a) => s + a.amount, 0);
  return {
    checkins,
    adjustments,
    checkinCount: checkins.length,
    checkinAmount,
    adjustmentAmount,
    totalAmount: checkinAmount + adjustmentAmount,
    shortageYen: checkins.reduce((s, r) => s + r.c.shortageYen, 0),
    surchargeYen: checkins.reduce((s, r) => s + r.c.surchargeYen, 0),
  };
}

/** 確定前の明細を最新の入館記録で集計し直す */
export async function refreshStatement(ex: Executor, st: Statement): Promise<Statement> {
  if (st.status === "closed") return st;
  const lines = await statementLines(ex, st.facilityId, st.period, st);
  const [updated] = await ex
    .update(schema.statements)
    .set({
      checkinCount: lines.checkinCount,
      checkinAmount: lines.checkinAmount,
      adjustmentAmount: lines.adjustmentAmount,
      totalAmount: lines.totalAmount,
    })
    .where(eq(schema.statements.id, st.id))
    .returning();
  return updated;
}

/** 対象月の全施設（入館または調整がある施設、および稼働中の施設）の明細を用意して集計する */
export async function prepareStatements(ex: Executor, period: Period) {
  const facilityIds = new Set<string>();
  const active = await ex.select({ id: schema.facilities.id }).from(schema.facilities).where(eq(schema.facilities.status, "active"));
  active.forEach((f) => facilityIds.add(f.id));
  const used = await ex
    .selectDistinct({ id: schema.checkins.facilityId })
    .from(schema.checkins)
    .where(eq(schema.checkins.period, period));
  used.forEach((f) => facilityIds.add(f.id));
  const adj = await ex
    .selectDistinct({ id: schema.settlementAdjustments.facilityId })
    .from(schema.settlementAdjustments)
    .where(eq(schema.settlementAdjustments.period, period));
  adj.forEach((f) => facilityIds.add(f.id));
  const out: Statement[] = [];
  for (const id of facilityIds) out.push(await refreshStatement(ex, await ensureStatement(ex, id, period)));
  return out;
}

type Result = { ok: true } | { ok: false; message: string };

export async function startReview(db: DB, statementId: string, actor: Actor, now = new Date()): Promise<Result> {
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(schema.statements).where(eq(schema.statements.id, statementId)).for("update");
    if (!st) return { ok: false as const, message: "明細が見つかりません" };
    if (st.status !== "draft") return { ok: false as const, message: "締め前の明細だけ確認依頼できます" };
    if (st.period >= currentPeriod(now)) return { ok: false as const, message: "対象月が終わってから確認依頼してください" };
    await refreshStatement(tx, st);
    await tx
      .update(schema.statements)
      .set({ status: "review", reviewStartedAt: now, facilityConfirmedAt: null, facilityConfirmedBy: null })
      .where(eq(schema.statements.id, st.id));
    await audit(actor, "statement.review", "statement", st.id, { period: st.period }, tx);
    return { ok: true as const };
  });
}

export async function reopenStatement(db: DB, statementId: string, actor: Actor): Promise<Result> {
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(schema.statements).where(eq(schema.statements.id, statementId)).for("update");
    if (!st) return { ok: false as const, message: "明細が見つかりません" };
    if (st.status !== "review") return { ok: false as const, message: "確認中の明細だけ締め前に戻せます" };
    await tx.update(schema.statements).set({ status: "draft" }).where(eq(schema.statements.id, st.id));
    await audit(actor, "statement.reopen", "statement", st.id, { period: st.period }, tx);
    return { ok: true as const };
  });
}

export async function facilityConfirm(db: DB, statementId: string, actor: Actor, now = new Date()): Promise<Result> {
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(schema.statements).where(eq(schema.statements.id, statementId)).for("update");
    if (!st || st.status !== "review") return { ok: false as const, message: "確認中の明細ではありません" };
    await tx
      .update(schema.statements)
      .set({ facilityConfirmedAt: now, facilityConfirmedBy: actor.name, disputeNote: null, disputedAt: null })
      .where(eq(schema.statements.id, st.id));
    await audit(actor, "statement.confirm", "statement", st.id, { period: st.period }, tx);
    return { ok: true as const };
  });
}

export async function facilityDispute(db: DB, statementId: string, actor: Actor, note: string, now = new Date()): Promise<Result> {
  if (!note.trim()) return { ok: false, message: "内容を入力してください" };
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(schema.statements).where(eq(schema.statements.id, statementId)).for("update");
    if (!st || st.status !== "review") return { ok: false as const, message: "確認中の明細ではありません" };
    await tx
      .update(schema.statements)
      .set({ disputeNote: note.trim(), disputedAt: now, facilityConfirmedAt: null, facilityConfirmedBy: null })
      .where(eq(schema.statements.id, st.id));
    await audit(actor, "statement.dispute", "statement", st.id, { period: st.period, note }, tx);
    return { ok: true as const };
  });
}

export async function closeStatement(db: DB, statementId: string, actor: Actor, now = new Date()): Promise<Result> {
  return db.transaction(async (tx) => {
    const [st] = await tx.select().from(schema.statements).where(eq(schema.statements.id, statementId)).for("update");
    if (!st) return { ok: false as const, message: "明細が見つかりません" };
    if (st.status !== "review") return { ok: false as const, message: "確認中の明細だけ確定できます" };
    if (st.disputedAt && !st.facilityConfirmedAt) return { ok: false as const, message: "施設から異議が出ています。解消してから確定してください" };
    const lines = await statementLines(tx, st.facilityId, st.period, st);
    await tx
      .update(schema.statements)
      .set({
        status: "closed",
        closedAt: now,
        closedBy: actor.name,
        checkinCount: lines.checkinCount,
        checkinAmount: lines.checkinAmount,
        adjustmentAmount: lines.adjustmentAmount,
        totalAmount: lines.totalAmount,
      })
      .where(eq(schema.statements.id, st.id));
    await audit(actor, "statement.close", "statement", st.id, { period: st.period, total: lines.totalAmount }, tx);
    return { ok: true as const };
  });
}

export async function statementsFor(ex: Executor, period: Period, facilityIds?: string[]) {
  const where = facilityIds
    ? and(eq(schema.statements.period, period), inArray(schema.statements.facilityId, facilityIds.length ? facilityIds : ["00000000-0000-0000-0000-000000000000"]))
    : eq(schema.statements.period, period);
  return ex
    .select({ st: schema.statements, facilityName: schema.facilities.name, operatorName: schema.operators.name })
    .from(schema.statements)
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.statements.facilityId))
    .innerJoin(schema.operators, eq(schema.operators.id, schema.facilities.operatorId))
    .where(where)
    .orderBy(schema.operators.name, schema.facilities.name);
}

