import "server-only";
import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { rolloverMemberById } from "./ledger";

/** 画面表示の前に当月の切替（失効→付与）を済ませる。バッチが止まっていても残高が正しくなる。 */
export async function ensureRollover(memberId: string, now = new Date()) {
  const db = await getDb();
  await db.transaction((tx) => rolloverMemberById(tx, memberId, now));
}

/** 会員に表示するお知らせ（全体・所属企業・利用したことのある施設） */
export async function noticesFor(member: { id: string; companyId: string }, now = new Date(), limit = 20) {
  const db = await getDb();
  const visited = await db
    .selectDistinct({ id: schema.checkins.facilityId })
    .from(schema.checkins)
    .where(eq(schema.checkins.memberId, member.id));
  const rows = await db
    .select()
    .from(schema.notices)
    .where(and(or(isNull(schema.notices.expiresAt), gt(schema.notices.expiresAt, now))))
    .orderBy(desc(schema.notices.publishedAt))
    .limit(100);
  return rows
    .filter((n) => n.publishedAt <= now)
    .filter(
      (n) =>
        n.audience === "all" ||
        (n.audience === "company" && n.companyId === member.companyId) ||
        (n.audience === "facility" && visited.some((v) => v.id === n.facilityId)),
    )
    .slice(0, limit);
}
