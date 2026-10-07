import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { CurrentStaff } from "./auth";

/** 施設担当が扱える施設（運営会社の全店舗、または指定の1店舗） */
export async function facilityIdsFor(u: CurrentStaff): Promise<string[]> {
  const db = await getDb();
  if (u.role === "facility") {
    if (u.facilityId) return [u.facilityId];
    if (!u.operatorId) return [];
    const rows = await db.select({ id: schema.facilities.id }).from(schema.facilities).where(eq(schema.facilities.operatorId, u.operatorId));
    return rows.map((r) => r.id);
  }
  const rows = await db.select({ id: schema.facilities.id }).from(schema.facilities);
  return rows.map((r) => r.id);
}

export async function facilitiesFor(u: CurrentStaff) {
  const ids = await facilityIdsFor(u);
  if (!ids.length) return [];
  const db = await getDb();
  return db.select().from(schema.facilities).where(inArray(schema.facilities.id, ids)).orderBy(schema.facilities.name);
}

export function canWrite(u: CurrentStaff): boolean {
  return u.role === "admin" || u.role === "operator";
}

export function assertWrite(u: CurrentStaff) {
  if (!canWrite(u)) throw new Error("閲覧専用のアカウントでは変更できません");
}

/** 企業担当が会員を操作できるか */
export async function memberInCompany(memberId: string, companyId: string) {
  const db = await getDb();
  const [m] = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.id, memberId), eq(schema.members.companyId, companyId)));
  return m ?? null;
}

export const ROLE_LABEL: Record<CurrentStaff["role"], string> = {
  admin: "運営管理者",
  operator: "運営担当",
  viewer: "運営（閲覧のみ）",
  company: "導入企業",
  facility: "提携施設",
};
