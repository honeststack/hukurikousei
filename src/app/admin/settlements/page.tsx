import Link from "next/link";
import { getDb } from "@/db";
import { requireStaff } from "@/lib/auth";
import { statementsFor } from "@/lib/statements";
import { addMonths, currentPeriod, fmtDateTime, fmtPeriod, isValidPeriod, num, yen } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PeriodNav } from "@/components/period-nav";
import { StaffShell } from "@/components/staff-shell";
import { StatusHanko } from "@/components/status-hanko";
import { READ } from "../_ctx";
import { prepareStatementsAction, statementOpAction } from "../actions-ops";

export const metadata = { title: "月次精算" };

export default async function SettlementsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const u = await requireStaff(READ);
  const { p } = await searchParams;
  const period = p && isValidPeriod(p) && p <= currentPeriod() ? p : addMonths(currentPeriod(), -1);
  const db = await getDb();
  const rows = await statementsFor(db, period);
  const total = rows.reduce((s, r) => s + r.st.totalAmount, 0);
  const canWrite = u.role !== "viewer";
  const ended = period < currentPeriod();

  return (
    <StaffShell
      user={u}
      title="月次精算"
      actions={
        <a className="btn btn-sm" href={`/api/csv/report?kind=facility&p=${period}`}>
          施設別CSV
        </a>
      }
    >
      <PeriodNav period={period} basePath="/admin/settlements" />
      <section className="panel">
        <h2>締めの流れ</h2>
        <ol className="small" style={{ margin: 0, paddingLeft: "1.3em" }}>
          <li>月が終わったら「集計し直す」で最新の入館を反映（毎日の定期処理でも集計されます）</li>
          <li>施設を選んで「施設に確認依頼」→ 施設の管理画面に「要確認」と表示されます</li>
          <li>施設が「確認済み」にしたら「確定」（運営管理者のみ）。確定後は金額が変わらず、支払通知書を出力できます</li>
        </ol>
      </section>
      {canWrite && (
        <ActionForm action={prepareStatementsAction}>
          <input type="hidden" name="period" value={period} />
          <p style={{ margin: "0 0 12px" }}>
            <SubmitButton className="btn btn-sm">{fmtPeriod(period)}分を集計し直す</SubmitButton>
            <span className="small mute" style={{ marginLeft: 8 }}>
              確定済みの明細は変わりません
            </span>
          </p>
        </ActionForm>
      )}
      <ActionForm action={statementOpAction}>
        <div className="panel panel-tight table-wrap">
          <table className="daicho">
            <thead>
              <tr>
                <th></th>
                <th>施設</th>
                <th>運営会社</th>
                <th className="r">入館</th>
                <th className="r">入館分</th>
                <th className="r">調整</th>
                <th className="r">精算額</th>
                <th>状態</th>
                <th>施設の確認</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty">
                    この月の明細はありません。「集計し直す」を押してください
                  </td>
                </tr>
              )}
              {rows.map(({ st, facilityName, operatorName }) => (
                <tr key={st.id}>
                  <td>{st.status !== "closed" && <input type="checkbox" name="statementId" value={st.id} aria-label="選択" style={{ width: 18, height: 18 }} />}</td>
                  <td>
                    <Link href={`/admin/settlements/${st.id}`}>{facilityName}</Link>
                  </td>
                  <td className="small">{operatorName}</td>
                  <td className="r">{num(st.checkinCount)}</td>
                  <td className="r">{yen(st.checkinAmount)}</td>
                  <td className="r">{yen(st.adjustmentAmount)}</td>
                  <td className="r">
                    <b>{yen(st.totalAmount)}</b>
                  </td>
                  <td>
                    <StatusHanko status={st.status} />
                  </td>
                  <td className="small">
                    {st.status === "review" &&
                      (st.facilityConfirmedAt ? (
                        <span style={{ color: "var(--wakatake)", fontWeight: 700 }}>確認済み {fmtDateTime(st.facilityConfirmedAt).slice(5)}</span>
                      ) : st.disputedAt ? (
                        <span style={{ color: "var(--shu)", fontWeight: 700 }}>問合せあり：{st.disputeNote}</span>
                      ) : (
                        "確認待ち"
                      ))}
                    {st.status === "closed" && `確定 ${fmtDateTime(st.closedAt).slice(5)}`}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6}>合計</td>
                <td className="r">{yen(total)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
        {canWrite && rows.some((r) => r.st.status !== "closed") && (
          <div className="row-actions">
            <SubmitButton className="btn btn-sm btn-primary" name="op" value="review">
              選んだ施設に確認依頼
            </SubmitButton>
            <SubmitButton className="btn btn-sm" name="op" value="reopen">
              締め前に戻す
            </SubmitButton>
            {u.role === "admin" && (
              <SubmitButton className="btn btn-sm btn-danger" name="op" value="close">
                選んだ明細を確定
              </SubmitButton>
            )}
            {!ended && <span className="small mute">今月分は月が終わるまで確認依頼できません</span>}
          </div>
        )}
      </ActionForm>
    </StaffShell>
  );
}
