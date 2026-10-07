import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { csvResponse, toCsv } from "@/lib/csv";
import { facilityIdsFor } from "@/lib/scope";
import { statementLines } from "@/lib/statements";
import { fmtDateTime } from "@/lib/time";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await requireStaff(["admin", "operator", "viewer", "facility"]);
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response("not found", { status: 404 });
  const db = await getDb();
  const [row] = await db
    .select({ st: schema.statements, f: schema.facilities })
    .from(schema.statements)
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.statements.facilityId))
    .where(eq(schema.statements.id, id));
  if (!row || !(await facilityIdsFor(u)).includes(row.f.id)) return new Response("not found", { status: 404 });
  const lines = await statementLines(db, row.f.id, row.st.period, row.st);
  const fullName = u.role !== "facility";
  const body = toCsv(
    ["区分", "営業日", "入館日時", "会社", fullName ? "会員" : "会員（姓）", "コース", "必要pt", "使用pt", "不足分（円）", "追加料金（円）", "精算方式", "精算比率（%）", "精算額（円）", "状態"],
    [
      ...lines.checkins.map(({ c, memberName, companyName }) => [
        "入館",
        c.businessDate,
        fmtDateTime(c.checkedInAt),
        companyName,
        fullName ? memberName : memberName.split(/\s|　/)[0],
        c.courseName,
        c.pointsRequired,
        c.pointsUsed,
        c.shortageYen,
        c.surchargeYen,
        c.settlementMethod,
        c.settlementRatioBp / 100,
        c.settlementAmount,
        c.status === "active" ? "有効" : "確定後に取消（翌月以降で調整）",
      ]),
      ...lines.adjustments.map((a) => ["調整", "", fmtDateTime(a.createdAt), "", "", a.reason, "", "", "", "", "", "", a.amount, ""]),
    ],
  );
  return csvResponse(`精算明細_${row.f.name}_${row.st.period}.csv`, body);
}
