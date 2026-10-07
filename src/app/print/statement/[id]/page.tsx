import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { facilityIdsFor } from "@/lib/scope";
import { getSettings } from "@/lib/settings";
import { statementLines } from "@/lib/statements";
import { addMonths, fmtDate, fmtPeriod, jstDate, lastDayOf, num, yen } from "@/lib/time";
import { PrintBar } from "@/components/print-bar";

export const metadata = { title: "支払通知書" };

const cell: React.CSSProperties = { border: "1px solid #999", padding: "2mm 3mm" };

export default async function StatementPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireStaff(["admin", "operator", "viewer", "facility"]);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await getDb();
  const [row] = await db
    .select({ st: schema.statements, f: schema.facilities, op: schema.operators })
    .from(schema.statements)
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.statements.facilityId))
    .innerJoin(schema.operators, eq(schema.operators.id, schema.facilities.operatorId))
    .where(eq(schema.statements.id, id));
  if (!row || !(await facilityIdsFor(u)).includes(row.f.id)) notFound();
  if (row.st.status !== "closed") {
    return <p style={{ padding: 40 }}>確定前の明細は支払通知書を出力できません。</p>;
  }
  const s = await getSettings(db);
  const lines = await statementLines(db, row.f.id, row.st.period, row.st);
  const byCourse = new Map<string, { count: number; amount: number }>();
  for (const { c } of lines.checkins) {
    const k = c.courseName;
    const cur = byCourse.get(k) ?? { count: 0, amount: 0 };
    byCourse.set(k, { count: cur.count + 1, amount: cur.amount + c.settlementAmount });
  }
  const total = row.st.totalAmount;
  const tax = Math.floor((total * 10) / 110);
  const docNo = `YF-${row.st.period.replace("-", "")}-${row.f.id.slice(0, 6).toUpperCase()}`;

  return (
    <>
      <PrintBar />
      <div className="sheet-a4" style={{ fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ textAlign: "right" }}>
          No. {docNo}
          <br />
          発行日 {fmtDate(jstDate(row.st.closedAt ?? new Date()))}
        </div>
        <h1 style={{ textAlign: "center", fontFamily: "var(--font-mincho)", fontSize: 30, letterSpacing: "0.5em", margin: "6mm 0 8mm" }}>支払通知書</h1>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "10mm" }}>
          <div>
            <div style={{ fontSize: 18, borderBottom: "1px solid #111", paddingBottom: 2, minWidth: "85mm" }}>{row.op.name} 御中</div>
            <div style={{ marginTop: 4 }}>対象施設：{row.f.name}</div>
            {row.op.invoiceNo && <div>登録番号：{row.op.invoiceNo}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 700 }}>{s.supportName}</div>
            <div>{s.supportPhone}</div>
            <div>{s.supportEmail}</div>
          </div>
        </div>
        <p style={{ marginTop: "8mm" }}>{fmtPeriod(row.st.period)}分の湯札ご利用について、下記のとおりお支払いいたします。</p>
        <div style={{ display: "flex", alignItems: "baseline", gap: "6mm", border: "2px solid #111", padding: "4mm 6mm", width: "fit-content", margin: "4mm 0 8mm" }}>
          <span>お支払金額（税込）</span>
          <span style={{ fontSize: 28, fontWeight: 700 }}>{yen(total)}</span>
          <span>（内消費税等 10%対象 {yen(tax)}）</span>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "6mm" }}>
          <thead>
            <tr style={{ background: "#f0ece2" }}>
              <th style={{ ...cell, textAlign: "left" }}>内容</th>
              <th style={{ ...cell, textAlign: "right" }}>件数</th>
              <th style={{ ...cell, textAlign: "right" }}>金額</th>
            </tr>
          </thead>
          <tbody>
            {[...byCourse.entries()].map(([name, v]) => (
              <tr key={name}>
                <td style={cell}>
                  {fmtPeriod(row.st.period)} 入館分　{name}
                </td>
                <td style={{ ...cell, textAlign: "right" }}>{num(v.count)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{yen(v.amount)}</td>
              </tr>
            ))}
            {lines.adjustments.map((a) => (
              <tr key={a.id}>
                <td style={cell}>調整：{a.reason}</td>
                <td style={{ ...cell, textAlign: "right" }}>—</td>
                <td style={{ ...cell, textAlign: "right" }}>{yen(a.amount)}</td>
              </tr>
            ))}
            <tr>
              <td style={{ ...cell, fontWeight: 700 }}>合計</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{num(row.st.checkinCount)}</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{yen(total)}</td>
            </tr>
          </tbody>
        </table>

        <table style={{ borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <th style={{ ...cell, background: "#f0ece2", textAlign: "left" }}>お振込先</th>
              <td style={cell}>{row.op.bankInfo || "（ご登録の口座）"}</td>
            </tr>
            <tr>
              <th style={{ ...cell, background: "#f0ece2", textAlign: "left" }}>お支払予定日</th>
              <td style={cell}>{fmtDate(lastDayOf(addMonths(row.st.period, 1)))}（目安）</td>
            </tr>
          </tbody>
        </table>
        <p style={{ marginTop: "8mm", fontSize: 11, color: "#555" }}>
          明細は管理画面の「月次精算」からCSVでご確認いただけます。本書の内容に相違がある場合は、発行日から7日以内にご連絡ください。
        </p>
      </div>
    </>
  );
}
