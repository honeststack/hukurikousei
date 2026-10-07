/**
 * 定期処理。毎日（少なくとも毎月1日）に1回実行する。何度実行しても結果は同じ。
 * - 全会員の当月切替（失効→付与、停止者の残高無効化）
 * - 前月・当月の精算明細の仮集計
 */
import { eq } from "drizzle-orm";
import { schema, type DB } from "@/db";
import { audit, SYSTEM_ACTOR } from "./audit";
import { rolloverMember } from "./ledger";
import { prepareStatements } from "./statements";
import { addMonths, currentPeriod } from "./time";

export async function runDaily(db: DB, now = new Date()) {
  const period = currentPeriod(now);
  await db
    .insert(schema.monthlyRuns)
    .values({ period, status: "running", startedAt: now })
    .onConflictDoUpdate({ target: schema.monthlyRuns.period, set: { status: "running", startedAt: now, error: null } });
  let granted = 0;
  let expired = 0;
  let revoked = 0;
  try {
    const members = await db.select({ id: schema.members.id }).from(schema.members);
    for (const { id } of members) {
      await db.transaction(async (tx) => {
        const [m] = await tx.select().from(schema.members).where(eq(schema.members.id, id)).for("update");
        if (!m) return;
        const r = await rolloverMember(tx, m, now);
        if (r.granted) granted++;
        if (r.expired) expired++;
        if (r.revoked) revoked++;
      });
    }
    await prepareStatements(db, addMonths(period, -1));
    await prepareStatements(db, period);
    const [prev] = await db.select().from(schema.monthlyRuns).where(eq(schema.monthlyRuns.period, period));
    await db
      .update(schema.monthlyRuns)
      .set({
        status: "done",
        finishedAt: new Date(),
        grantedCount: (prev?.grantedCount ?? 0) + granted,
        expiredCount: (prev?.expiredCount ?? 0) + expired,
      })
      .where(eq(schema.monthlyRuns.period, period));
    await audit(SYSTEM_ACTOR, "job.daily", "monthly_run", period, { granted, expired, revoked, members: members.length }, db);
    return { period, granted, expired, revoked, members: members.length };
  } catch (e) {
    await db
      .update(schema.monthlyRuns)
      .set({ status: "failed", finishedAt: new Date(), error: e instanceof Error ? e.message : String(e) })
      .where(eq(schema.monthlyRuns.period, period));
    throw e;
  }
}
