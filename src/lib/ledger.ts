/**
 * ポイント台帳と月次の切替（失効→付与）。
 * 切替は会員ごとに冪等で、月次バッチ・会員画面の表示・入館の直前のいずれからでも呼ばれる。
 * バッチが止まっても、会員が画面を開いた時点で正しい残高になる。
 */
import { and, desc, eq, isNull, lt, lte, or, gte, sql } from "drizzle-orm";
import { schema, type Executor } from "@/db";
import { addMonths, firstDayOf, jstDate, lastDayOf, periodOf, type Period, type Ymd } from "./time";

type Member = typeof schema.members.$inferSelect;
export type Contract = typeof schema.contracts.$inferSelect;

export async function balanceOf(ex: Executor, memberId: string): Promise<number> {
  const [r] = await ex
    .select({ total: sql<string>`coalesce(sum(${schema.pointEntries.amount}), 0)` })
    .from(schema.pointEntries)
    .where(eq(schema.pointEntries.memberId, memberId));
  return Number(r?.total ?? 0);
}

export async function ledgerOf(ex: Executor, memberId: string, limit = 200) {
  return ex
    .select()
    .from(schema.pointEntries)
    .where(eq(schema.pointEntries.memberId, memberId))
    .orderBy(desc(schema.pointEntries.createdAt))
    .limit(limit);
}

/** date 時点で有効な企業契約（開始日が最も新しいもの） */
export async function contractOn(ex: Executor, companyId: string, date: Ymd): Promise<Contract | null> {
  const [c] = await ex
    .select()
    .from(schema.contracts)
    .where(
      and(
        eq(schema.contracts.companyId, companyId),
        lte(schema.contracts.startsOn, date),
        or(isNull(schema.contracts.endsOn), gte(schema.contracts.endsOn, date)),
      ),
    )
    .orderBy(desc(schema.contracts.startsOn))
    .limit(1);
  return c ?? null;
}

export function memberActiveOn(m: Pick<Member, "startsOn" | "stopsOn">, date: Ymd): boolean {
  return m.startsOn <= date && (!m.stopsOn || date < m.stopsOn);
}

/**
 * 会員の当月分の切替。
 * 1) 前月以前の履歴があり当月の失効記録がなければ、契約の繰越ルールで残高を失効
 * 2) 当月の付与がなく、付与日を過ぎていれば付与
 * 3) 利用停止日を過ぎていれば残高を全て無効化
 * 呼び出し側で会員行をロックしていること（入館と同時に走らせないため）。
 */
export async function rolloverMember(ex: Executor, m: Member, now: Date) {
  const today = jstDate(now);
  const period = periodOf(today);
  const first = firstDayOf(period);
  const result = { expired: 0, granted: 0, revoked: 0 };

  // 1) 失効
  const [hist] = await ex
    .select({ n: sql<number>`count(*)` })
    .from(schema.pointEntries)
    .where(and(eq(schema.pointEntries.memberId, m.id), lt(schema.pointEntries.period, period)));
  if (Number(hist?.n ?? 0) > 0) {
    const [done] = await ex
      .select({ id: schema.pointEntries.id })
      .from(schema.pointEntries)
      .where(and(eq(schema.pointEntries.memberId, m.id), eq(schema.pointEntries.period, period), eq(schema.pointEntries.kind, "expire")));
    if (!done) {
      const balance = await balanceOf(ex, m.id);
      const prevContract = await contractOn(ex, m.companyId, lastDayOf(addMonths(period, -1)));
      const keep = prevContract?.carryover === "cap" ? Math.max(0, Math.min(balance, prevContract.carryoverCap)) : 0;
      const amount = -Math.max(0, balance - keep);
      // 0件でも記録する（当月の失効処理済みの印）。画面では0件の行は表示しない。
      await ex
        .insert(schema.pointEntries)
        .values({ memberId: m.id, kind: "expire", amount, period, note: keep > 0 ? `繰越 ${keep}pt` : "前月分の失効" })
        .onConflictDoNothing();
      result.expired = -amount;
    }
  }

  // 3) 停止（停止後は付与もしない）
  if (m.stopsOn && m.stopsOn <= today) {
    const balance = await balanceOf(ex, m.id);
    if (balance > 0) {
      await ex.insert(schema.pointEntries).values({ memberId: m.id, kind: "revoke", amount: -balance, period, note: "利用停止" });
      result.revoked = balance;
    }
    return result;
  }

  // 2) 付与
  const [granted] = await ex
    .select({ id: schema.pointEntries.id })
    .from(schema.pointEntries)
    .where(and(eq(schema.pointEntries.memberId, m.id), eq(schema.pointEntries.period, period), eq(schema.pointEntries.kind, "grant")));
  if (!granted && m.startsOn <= today) {
    const grantDate = m.startsOn > first ? m.startsOn : first;
    const contract = await contractOn(ex, m.companyId, grantDate);
    const eligible = contract && (m.startsOn <= first || contract.midMonthGrant === "full");
    if (eligible && contract.monthlyPoints > 0) {
      const inserted = await ex
        .insert(schema.pointEntries)
        .values({
          memberId: m.id,
          kind: "grant",
          amount: contract.monthlyPoints,
          period,
          note: m.startsOn > first ? "当月分（月途中の利用開始）" : "毎月1日の付与",
        })
        .onConflictDoNothing()
        .returning();
      if (inserted.length) result.granted = contract.monthlyPoints;
    }
  }
  return result;
}

/** 会員行をロックして切替する（単独で呼ぶ場合） */
export async function rolloverMemberById(ex: Executor, memberId: string, now: Date) {
  const [m] = await ex.select().from(schema.members).where(eq(schema.members.id, memberId)).for("update");
  if (!m) return null;
  return rolloverMember(ex, m, now);
}

export async function addAdjustment(ex: Executor, memberId: string, amount: number, note: string, createdBy: string, now: Date) {
  const period = periodOf(jstDate(now));
  const [row] = await ex
    .insert(schema.pointEntries)
    .values({ memberId, kind: "adjust", amount, period, note, createdBy })
    .returning();
  return row;
}
