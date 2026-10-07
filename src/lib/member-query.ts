import "server-only";
import { and, asc, eq, gt, ilike, isNotNull, isNull, lte, or, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { jstDate } from "./time";

export type MemberFilter = { companyId?: string; q?: string; status?: string };

/** 会員の検索（企業画面・運営画面で共通） */
export async function searchMembers(f: MemberFilter, limit = 500) {
  const db = await getDb();
  const today = jstDate(new Date());
  const conds: SQL[] = [];
  if (f.companyId) conds.push(eq(schema.members.companyId, f.companyId));
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, "\\$&")}%`;
    conds.push(
      or(
        ilike(schema.members.name, like),
        ilike(schema.members.nameKana, like),
        ilike(schema.members.email, like),
        ilike(schema.members.employeeNo, like),
        ilike(schema.members.department, like),
      )!,
    );
  }
  const live = or(isNull(schema.members.stopsOn), gt(schema.members.stopsOn, today))!;
  switch (f.status) {
    case "invited":
      conds.push(isNull(schema.members.passwordHash), live, lte(schema.members.startsOn, today));
      break;
    case "active":
      conds.push(isNotNull(schema.members.passwordHash), live, lte(schema.members.startsOn, today));
      break;
    case "scheduled":
      conds.push(isNotNull(schema.members.stopsOn), gt(schema.members.stopsOn, today));
      break;
    case "stopped":
      conds.push(lte(schema.members.stopsOn, today));
      break;
    case "not_started":
      conds.push(gt(schema.members.startsOn, today));
      break;
  }
  return db
    .select({ m: schema.members, companyName: schema.companies.name })
    .from(schema.members)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.members.companyId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(schema.companies.name), asc(schema.members.employeeNo))
    .limit(limit);
}
