/** 月次の集計（企業別の利用状況・施設別の精算額） */
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { schema, type Executor } from "@/db";
import { contractOn } from "./ledger";
import { firstDayOf, lastDayOf, type Period } from "./time";

export type CompanyRow = {
  companyId: string;
  companyName: string;
  members: number;
  users: number;
  visits: number;
  pointsUsed: number;
  usageYen: number;
  usageRate: number;
  billingBasis: "per_member" | "usage" | "none";
  billingAmount: number;
};

/** 対象月に1日でも利用可能だった会員 */
export function memberInPeriod(period: Period) {
  return and(
    lte(schema.members.startsOn, lastDayOf(period)),
    or(isNull(schema.members.stopsOn), gt(schema.members.stopsOn, firstDayOf(period))),
  );
}

export async function companyReport(ex: Executor, period: Period, companyId?: string): Promise<CompanyRow[]> {
  const companies = await ex
    .select()
    .from(schema.companies)
    .where(companyId ? eq(schema.companies.id, companyId) : undefined)
    .orderBy(schema.companies.name);
  const memberCounts = await ex
    .select({ companyId: schema.members.companyId, n: sql<number>`count(*)` })
    .from(schema.members)
    .where(memberInPeriod(period))
    .groupBy(schema.members.companyId);
  const usage = await ex
    .select({
      companyId: schema.checkins.companyId,
      users: sql<number>`count(distinct ${schema.checkins.memberId})`,
      visits: sql<number>`count(*)`,
      points: sql<number>`coalesce(sum(${schema.checkins.pointsUsed}), 0)`,
      yen: sql<number>`coalesce(sum(${schema.checkins.pointsUsed} * ${schema.checkins.yenPerPoint}), 0)`,
    })
    .from(schema.checkins)
    .where(and(eq(schema.checkins.period, period), eq(schema.checkins.status, "active")))
    .groupBy(schema.checkins.companyId);
  const rows: CompanyRow[] = [];
  for (const c of companies) {
    const members = Number(memberCounts.find((m) => m.companyId === c.id)?.n ?? 0);
    const u = usage.find((x) => x.companyId === c.id);
    const contract = (await contractOn(ex, c.id, lastDayOf(period))) ?? (await contractOn(ex, c.id, firstDayOf(period)));
    const usageYen = Number(u?.yen ?? 0);
    const billingBasis = contract?.billingBasis ?? "none";
    const billingAmount = !contract ? 0 : contract.billingBasis === "per_member" ? contract.feePerMember * members : usageYen;
    if (companyId === undefined && members === 0 && !u && !contract) continue;
    const users = Number(u?.users ?? 0);
    rows.push({
      companyId: c.id,
      companyName: c.name,
      members,
      users,
      visits: Number(u?.visits ?? 0),
      pointsUsed: Number(u?.points ?? 0),
      usageYen,
      usageRate: members ? users / members : 0,
      billingBasis,
      billingAmount,
    });
  }
  return rows;
}

export type FacilityRow = {
  facilityId: string;
  facilityName: string;
  operatorName: string;
  visits: number;
  pointsUsed: number;
  shortageYen: number;
  surchargeYen: number;
  checkinAmount: number;
  adjustmentAmount: number;
  totalAmount: number;
  status: "draft" | "review" | "closed" | null;
};

export async function facilityReport(ex: Executor, period: Period, facilityIds?: string[]): Promise<FacilityRow[]> {
  const facilities = await ex
    .select({ f: schema.facilities, operatorName: schema.operators.name })
    .from(schema.facilities)
    .innerJoin(schema.operators, eq(schema.operators.id, schema.facilities.operatorId))
    .orderBy(schema.operators.name, schema.facilities.name);
  const agg = await ex
    .select({
      facilityId: schema.checkins.facilityId,
      visits: sql<number>`count(*)`,
      points: sql<number>`coalesce(sum(${schema.checkins.pointsUsed}), 0)`,
      shortage: sql<number>`coalesce(sum(${schema.checkins.shortageYen}), 0)`,
      surcharge: sql<number>`coalesce(sum(${schema.checkins.surchargeYen}), 0)`,
      amount: sql<number>`coalesce(sum(${schema.checkins.settlementAmount}), 0)`,
    })
    .from(schema.checkins)
    .where(and(eq(schema.checkins.period, period), eq(schema.checkins.status, "active")))
    .groupBy(schema.checkins.facilityId);
  const adj = await ex
    .select({
      facilityId: schema.settlementAdjustments.facilityId,
      amount: sql<number>`coalesce(sum(${schema.settlementAdjustments.amount}), 0)`,
    })
    .from(schema.settlementAdjustments)
    .where(eq(schema.settlementAdjustments.period, period))
    .groupBy(schema.settlementAdjustments.facilityId);
  const sts = await ex.select().from(schema.statements).where(eq(schema.statements.period, period));
  return facilities
    .filter(({ f }) => !facilityIds || facilityIds.includes(f.id))
    .map(({ f, operatorName }) => {
      const a = agg.find((x) => x.facilityId === f.id);
      const st = sts.find((s) => s.facilityId === f.id) ?? null;
      const closed = st?.status === "closed";
      // 確定済みの月は確定時の金額を正とする
      const checkinAmount = closed ? st.checkinAmount : Number(a?.amount ?? 0);
      const adjustmentAmount = closed ? st.adjustmentAmount : Number(adj.find((x) => x.facilityId === f.id)?.amount ?? 0);
      return {
        facilityId: f.id,
        facilityName: f.name,
        operatorName,
        visits: closed ? st.checkinCount : Number(a?.visits ?? 0),
        pointsUsed: Number(a?.points ?? 0),
        shortageYen: Number(a?.shortage ?? 0),
        surchargeYen: Number(a?.surcharge ?? 0),
        checkinAmount,
        adjustmentAmount,
        totalAmount: checkinAmount + adjustmentAmount,
        status: st?.status ?? null,
      };
    })
    .filter((r) => r.visits > 0 || r.adjustmentAmount !== 0 || r.status !== null);
}
