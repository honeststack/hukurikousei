import "server-only";
import { and, desc, eq, gte, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { addDays, isValidYmd, jstDate } from "./time";

export type CheckinFilter = {
  from?: string;
  to?: string;
  company?: string;
  facility?: string;
  q?: string;
  status?: string;
  flagged?: string;
  device?: string;
};

export function normalizeCheckinFilter(sp: CheckinFilter) {
  const today = jstDate(new Date());
  const to = sp.to && isValidYmd(sp.to) ? sp.to : today;
  const from = sp.from && isValidYmd(sp.from) ? sp.from : addDays(to, -30);
  return { ...sp, from, to };
}

export async function searchCheckins(f: ReturnType<typeof normalizeCheckinFilter>, limit = 1000) {
  const db = await getDb();
  const conds: SQL[] = [gte(schema.checkins.businessDate, f.from), lte(schema.checkins.businessDate, f.to)];
  const uuid = /^[0-9a-f-]{36}$/;
  if (f.company && uuid.test(f.company)) conds.push(eq(schema.checkins.companyId, f.company));
  if (f.facility && uuid.test(f.facility)) conds.push(eq(schema.checkins.facilityId, f.facility));
  if (f.status === "active" || f.status === "cancelled") conds.push(eq(schema.checkins.status, f.status));
  if (f.device && /^[A-Za-z0-9_-]{8,64}$/.test(f.device)) conds.push(eq(schema.checkins.deviceId, f.device));
  if (f.flagged === "1") conds.push(sql`jsonb_array_length(${schema.checkins.flags}) > 0`);
  if (f.flagged === "open") conds.push(sql`jsonb_array_length(${schema.checkins.flags}) > 0`, isNull(schema.checkins.flagsResolvedAt));
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(or(ilike(schema.members.name, like), ilike(schema.members.employeeNo, like), ilike(schema.members.email, like))!);
  }
  return db
    .select({
      c: schema.checkins,
      memberName: schema.members.name,
      employeeNo: schema.members.employeeNo,
      companyName: schema.companies.name,
      facilityName: schema.facilities.name,
    })
    .from(schema.checkins)
    .innerJoin(schema.members, eq(schema.members.id, schema.checkins.memberId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.checkins.companyId))
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.checkins.facilityId))
    .where(and(...conds))
    .orderBy(desc(schema.checkins.checkedInAt))
    .limit(limit);
}
