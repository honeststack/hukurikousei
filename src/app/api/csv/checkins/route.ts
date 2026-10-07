import { requireStaff } from "@/lib/auth";
import { FLAG_LABELS } from "@/lib/checkin";
import { normalizeCheckinFilter, searchCheckins } from "@/lib/checkin-query";
import { csvResponse, toCsv } from "@/lib/csv";
import { fmtDateTime } from "@/lib/time";

export async function GET(req: Request) {
  await requireStaff(["admin", "operator", "viewer"]);
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const f = normalizeCheckinFilter(sp);
  const rows = await searchCheckins(f, 100000);
  return csvResponse(
    `入館記録_${f.from}_${f.to}.csv`,
    toCsv(
      ["入館日時", "営業日", "精算月", "企業", "社員番号", "会員", "施設", "コース", "必要pt", "使用pt", "換算率", "不足分（円）", "追加料金（円）", "施設定価", "精算方式", "精算比率（%）", "精算額（円）", "状態", "取消日時", "取消理由", "要確認", "入館ID"],
      rows.map(({ c, memberName, employeeNo, companyName, facilityName }) => [
        fmtDateTime(c.checkedInAt),
        c.businessDate,
        c.period,
        companyName,
        employeeNo,
        memberName,
        facilityName,
        c.courseName,
        c.pointsRequired,
        c.pointsUsed,
        c.yenPerPoint,
        c.shortageYen,
        c.surchargeYen,
        c.listPrice,
        c.settlementMethod,
        c.settlementRatioBp / 100,
        c.settlementAmount,
        c.status === "active" ? "有効" : "取消",
        c.cancelledAt ? fmtDateTime(c.cancelledAt) : "",
        c.cancelReason ?? "",
        c.flags.map((x) => FLAG_LABELS[x] ?? x).join("・"),
        c.id,
      ]),
    ),
  );
}
