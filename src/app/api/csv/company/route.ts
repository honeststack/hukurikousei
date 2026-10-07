import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { contractOn } from "@/lib/ledger";
import { searchMembers } from "@/lib/member-query";
import { MEMBER_STATUS_LABEL, memberStatus } from "@/lib/members";
import { companyReport } from "@/lib/reports";
import { currentPeriod, fmtDateTime, isValidPeriod, jstDate, lastDayOf } from "@/lib/time";

/** 導入企業向けのCSV（運営は ?company= で企業を指定） */
export async function GET(req: Request) {
  const u = await requireStaff(["admin", "operator", "viewer", "company"]);
  const url = new URL(req.url);
  const companyId = u.role === "company" ? u.companyId! : url.searchParams.get("company") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(companyId)) return new Response("company required", { status: 400 });
  const kind = url.searchParams.get("kind");
  const p = url.searchParams.get("p") ?? "";
  const period = isValidPeriod(p) ? p : currentPeriod();
  const db = await getDb();
  const [company] = await db.select().from(schema.companies).where(eq(schema.companies.id, companyId));
  if (!company) return new Response("not found", { status: 404 });

  if (kind === "members") {
    const today = jstDate(new Date());
    const rows = await searchMembers({ companyId }, 100000);
    return csvResponse(
      `会員一覧_${company.name}.csv`,
      toCsv(
        ["社員番号", "氏名", "フリガナ", "メールアドレス", "部署", "利用開始日", "利用停止日", "状態", "最終ログイン"],
        rows.map(({ m }) => [
          m.employeeNo,
          m.name,
          m.nameKana,
          m.email,
          m.department,
          m.startsOn.replace(/-/g, "/"),
          m.stopsOn?.replace(/-/g, "/") ?? "",
          MEMBER_STATUS_LABEL[memberStatus(m, today)],
          fmtDateTime(m.lastLoginAt),
        ]),
      ),
    );
  }

  if (kind === "usage" || kind === "billing") {
    const [r] = await companyReport(db, period, companyId);
    const contract = await contractOn(db, companyId, lastDayOf(period));
    const header = ["対象月", "会員数", "利用人数", "利用回数", "利用率（%）", "利用ポイント", "請求基準", "請求額（円）"];
    const line = [
      period,
      r?.members ?? 0,
      r?.users ?? 0,
      r?.visits ?? 0,
      Math.round((r?.usageRate ?? 0) * 1000) / 10,
      r?.pointsUsed ?? 0,
      r?.billingBasis === "per_member" ? "会員数×月額" : r?.billingBasis === "usage" ? "利用分" : "なし",
      r?.billingAmount ?? 0,
    ];
    const rows: (string | number)[][] = [line];
    if (contract?.showIndividualUsage) {
      const people = await db
        .select({
          employeeNo: schema.members.employeeNo,
          name: schema.members.name,
          visits: sql<number>`count(*)`,
          points: sql<number>`sum(${schema.checkins.pointsUsed})`,
        })
        .from(schema.checkins)
        .innerJoin(schema.members, eq(schema.members.id, schema.checkins.memberId))
        .where(and(eq(schema.checkins.companyId, companyId), eq(schema.checkins.period, period), eq(schema.checkins.status, "active")))
        .groupBy(schema.members.employeeNo, schema.members.name);
      rows.push([], ["社員番号", "氏名", "利用回数", "利用ポイント"]);
      people.forEach((pp) => rows.push([pp.employeeNo, pp.name, Number(pp.visits), Number(pp.points)]));
    }
    return csvResponse(`${kind === "usage" ? "利用状況" : "請求明細"}_${company.name}_${period}.csv`, toCsv(header, rows));
  }
  return new Response("unknown kind", { status: 400 });
}
