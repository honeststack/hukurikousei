import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { facilitiesFor } from "@/lib/scope";
import { refreshStatement, STATUS_LABEL } from "@/lib/statements";
import { fmtPeriod, num, yen } from "@/lib/time";
import { StaffShell } from "@/components/staff-shell";
import { StatusHanko } from "@/components/status-hanko";

export const metadata = { title: "月次精算" };

export default async function FacilitySettlementsPage() {
  const u = await requireStaff(["facility"]);
  const facilities = await facilitiesFor(u);
  const db = await getDb();
  const ids = facilities.map((f) => f.id);
  const list = ids.length
    ? await db.select().from(schema.statements).where(inArray(schema.statements.facilityId, ids)).orderBy(desc(schema.statements.period))
    : [];
  const rows = [];
  for (const st of list) rows.push(st.status === "closed" ? st : await refreshStatement(db, st));
  const name = (id: string) => facilities.find((f) => f.id === id)?.name ?? "";

  return (
    <StaffShell user={u} title="月次精算">
      <p className="small">
        毎月、前月分の明細を運営が「確認中」にします。内容をご確認のうえ「確認済み」にしてください。運営が確定すると、支払通知書を出力できます。
      </p>
      <div className="panel panel-tight table-wrap">
        <table className="daicho">
          <thead>
            <tr>
              <th>対象月</th>
              <th>施設</th>
              <th className="r">入館</th>
              <th className="r">精算額</th>
              <th>状態</th>
              <th>施設の確認</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="empty">
                  明細はまだありません
                </td>
              </tr>
            )}
            {rows.map((st) => (
              <tr key={st.id}>
                <td>
                  <Link href={`/facility/settlements/${st.id}`}>{fmtPeriod(st.period)}</Link>
                </td>
                <td>{name(st.facilityId)}</td>
                <td className="r">{num(st.checkinCount)}</td>
                <td className="r">{yen(st.totalAmount)}</td>
                <td>
                  <StatusHanko status={st.status} />
                </td>
                <td>
                  {st.status === "review" &&
                    (st.facilityConfirmedAt ? (
                      <span className="hanko hanko-take">確認済み</span>
                    ) : st.disputedAt ? (
                      <span className="hanko hanko-shu">問合せ中</span>
                    ) : (
                      <span className="hanko hanko-shu">要確認</span>
                    ))}
                  {st.status !== "review" && <span className="mute small">{STATUS_LABEL[st.status]}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StaffShell>
  );
}
