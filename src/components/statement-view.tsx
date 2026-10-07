import { METHOD_LABEL } from "@/lib/pricing";
import type { statementLines, Statement } from "@/lib/statements";
import { fmtDateTime, fmtPeriod, fmtShortDate, num, yen } from "@/lib/time";
import { StatusHanko } from "./status-hanko";

type Lines = Awaited<ReturnType<typeof statementLines>>;

const methodLabel = (m: string) => (m in METHOD_LABEL ? METHOD_LABEL[m as keyof typeof METHOD_LABEL] : "未設定");

/** 精算明細（運営・施設で共通） */
export function StatementView({
  st,
  facilityName,
  lines,
  showMembers,
}: {
  st: Statement;
  facilityName: string;
  lines: Lines;
  showMembers: "full" | "family";
}) {
  const closed = st.status === "closed";
  const count = closed ? st.checkinCount : lines.checkinCount;
  const checkinAmount = closed ? st.checkinAmount : lines.checkinAmount;
  const adjustmentAmount = closed ? st.adjustmentAmount : lines.adjustmentAmount;
  const total = closed ? st.totalAmount : lines.totalAmount;
  const name = (n: string) => (showMembers === "full" ? n : `${n.split(/\s|　/)[0]} 様`);
  return (
    <>
      <div className="stats">
        <div className="stat">
          <div className="stat-label">対象月</div>
          <div className="stat-value" style={{ fontSize: "1.2rem" }}>
            {fmtPeriod(st.period)}
          </div>
          <div className="small">{facilityName}</div>
        </div>
        <div className="stat">
          <div className="stat-label">入館</div>
          <div className="stat-value">
            {num(count)}
            <small>件</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">入館分</div>
          <div className="stat-value">{yen(checkinAmount)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">調整（前月以前の取消）</div>
          <div className="stat-value">{yen(adjustmentAmount)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">精算額</div>
          <div className="stat-value">{yen(total)}</div>
        </div>
        <div className="stat" style={{ display: "grid", placeItems: "center" }}>
          <StatusHanko status={st.status} />
        </div>
      </div>
      {closed && (
        <p className="small mute">
          {fmtDateTime(st.closedAt)} に {st.closedBy} が確定しました。確定後の取消は、取消した月の精算に調整行として計上されます。
        </p>
      )}
      {st.disputedAt && !st.facilityConfirmedAt && (
        <p className="notice notice-error">
          施設からの問合せ（{fmtDateTime(st.disputedAt)}）：{st.disputeNote}
        </p>
      )}
      {st.facilityConfirmedAt && (
        <p className="notice notice-ok">
          {fmtDateTime(st.facilityConfirmedAt)} に施設（{st.facilityConfirmedBy}）が内容を確認しました。
        </p>
      )}

      <section className="panel panel-tight">
        <h2>入館の明細</h2>
        <div className="table-wrap">
          <table className="daicho">
            <thead>
              <tr>
                <th>営業日</th>
                <th>会員</th>
                <th>会社</th>
                <th>コース</th>
                <th className="r">使用pt</th>
                <th className="r">店頭収受</th>
                <th>精算方式</th>
                <th className="r">精算額</th>
              </tr>
            </thead>
            <tbody>
              {lines.checkins.length === 0 && (
                <tr>
                  <td colSpan={8} className="empty">
                    入館はありません
                  </td>
                </tr>
              )}
              {lines.checkins.map(({ c, memberName, companyName }) => (
                <tr key={c.id} className={c.status === "cancelled" ? "is-off" : undefined}>
                  <td>{fmtShortDate(c.businessDate)}</td>
                  <td>{name(memberName)}</td>
                  <td>{companyName}</td>
                  <td>{c.courseName}</td>
                  <td className="r">{num(c.pointsUsed)}</td>
                  <td className="r">{yen(c.shortageYen + c.surchargeYen)}</td>
                  <td className="small">
                    {methodLabel(c.settlementMethod)}
                    {c.settlementMethod !== "unit" && c.settlementMethod !== "none" && `（${c.settlementRatioBp / 100}%）`}
                  </td>
                  <td className="r">{yen(c.settlementAmount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={7}>入館分 合計</td>
                <td className="r">{yen(checkinAmount)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {lines.adjustments.length > 0 && (
        <section className="panel panel-tight">
          <h2>調整</h2>
          <table className="daicho">
            <thead>
              <tr>
                <th>計上日</th>
                <th>内容</th>
                <th className="r">金額</th>
              </tr>
            </thead>
            <tbody>
              {lines.adjustments.map((a) => (
                <tr key={a.id}>
                  <td>{fmtDateTime(a.createdAt)}</td>
                  <td>{a.reason}</td>
                  <td className="r">{yen(a.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
