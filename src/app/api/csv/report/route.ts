import { getDb } from "@/db";
import { requireStaff } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { companyReport, facilityReport } from "@/lib/reports";
import { STATUS_LABEL } from "@/lib/statements";
import { currentPeriod, isValidPeriod } from "@/lib/time";

export async function GET(req: Request) {
  await requireStaff(["admin", "operator", "viewer"]);
  const url = new URL(req.url);
  const p = url.searchParams.get("p") ?? "";
  const period = isValidPeriod(p) ? p : currentPeriod();
  const db = await getDb();
  if (url.searchParams.get("kind") === "company") {
    const rows = await companyReport(db, period);
    return csvResponse(
      `企業別集計_${period}.csv`,
      toCsv(
        ["対象月", "企業", "会員数", "利用人数", "利用率（%）", "入館数", "利用ポイント", "利用額（円）", "請求基準", "請求額（円）"],
        rows.map((r) => [
          period,
          r.companyName,
          r.members,
          r.users,
          Math.round(r.usageRate * 1000) / 10,
          r.visits,
          r.pointsUsed,
          r.usageYen,
          r.billingBasis === "per_member" ? "会員数×月額" : r.billingBasis === "usage" ? "利用分" : "契約なし",
          r.billingAmount,
        ]),
      ),
    );
  }
  const rows = await facilityReport(db, period);
  return csvResponse(
    `施設別精算_${period}.csv`,
    toCsv(
      ["対象月", "運営会社", "施設", "入館数", "利用ポイント", "店頭収受・不足分（円）", "店頭収受・追加料金（円）", "入館分（円）", "調整（円）", "精算額（円）", "状態"],
      rows.map((r) => [
        period,
        r.operatorName,
        r.facilityName,
        r.visits,
        r.pointsUsed,
        r.shortageYen,
        r.surchargeYen,
        r.checkinAmount,
        r.adjustmentAmount,
        r.totalAmount,
        r.status ? STATUS_LABEL[r.status] : "未集計",
      ]),
    ),
  );
}
