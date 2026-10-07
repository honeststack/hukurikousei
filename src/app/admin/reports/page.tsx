import Link from "next/link";
import { getDb } from "@/db";
import { requireStaff } from "@/lib/auth";
import { companyReport, facilityReport } from "@/lib/reports";
import { currentPeriod, fmtPeriod, isValidPeriod, num, yen } from "@/lib/time";
import { PeriodNav } from "@/components/period-nav";
import { StaffShell } from "@/components/staff-shell";
import { StatusHanko } from "@/components/status-hanko";
import { READ } from "../_ctx";

export const metadata = { title: "月次集計" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const u = await requireStaff(READ);
  const { p } = await searchParams;
  const period = p && isValidPeriod(p) && p <= currentPeriod() ? p : currentPeriod();
  const db = await getDb();
  const comp = await companyReport(db, period);
  const fac = await facilityReport(db, period);
  const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
  const billing = sum(comp, (r) => r.billingAmount);
  const payout = sum(fac, (r) => r.totalAmount);

  return (
    <StaffShell
      user={u}
      title="月次集計"
      actions={
        <>
          <a className="btn btn-sm" href={`/api/csv/report?kind=company&p=${period}`}>
            企業別CSV
          </a>
          <a className="btn btn-sm" href={`/api/csv/report?kind=facility&p=${period}`}>
            施設別CSV
          </a>
        </>
      }
    >
      <PeriodNav period={period} basePath="/admin/reports" />
      {period === currentPeriod() && <p className="notice">今月分は月の途中の集計です。</p>}
      <div className="stats">
        <div className="stat">
          <div className="stat-label">利用人数</div>
          <div className="stat-value">
            {num(sum(comp, (r) => r.users))}
            <small>／{num(sum(comp, (r) => r.members))}名</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">入館</div>
          <div className="stat-value">
            {num(sum(comp, (r) => r.visits))}
            <small>件</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">企業への請求</div>
          <div className="stat-value">{yen(billing)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">施設への精算</div>
          <div className="stat-value">{yen(payout)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">差額</div>
          <div className="stat-value" style={{ color: billing - payout < 0 ? "var(--shu)" : undefined }}>
            {yen(billing - payout)}
          </div>
        </div>
      </div>

      <section className="panel panel-tight table-wrap">
        <h2>企業別の利用人数（{fmtPeriod(period)}）</h2>
        <table className="daicho">
          <thead>
            <tr>
              <th>企業</th>
              <th className="r">会員</th>
              <th className="r">利用人数</th>
              <th className="r">利用率</th>
              <th className="r">入館</th>
              <th className="r">利用pt</th>
              <th>請求基準</th>
              <th className="r">請求額</th>
            </tr>
          </thead>
          <tbody>
            {comp.map((r) => (
              <tr key={r.companyId}>
                <td>
                  <Link href={`/admin/companies/${r.companyId}`}>{r.companyName}</Link>
                </td>
                <td className="r">{num(r.members)}</td>
                <td className="r">{num(r.users)}</td>
                <td className="r">{Math.round(r.usageRate * 100)}%</td>
                <td className="r">{num(r.visits)}</td>
                <td className="r">{num(r.pointsUsed)}</td>
                <td className="small">{r.billingBasis === "per_member" ? "会員数×月額" : r.billingBasis === "usage" ? "利用分" : "契約なし"}</td>
                <td className="r">{yen(r.billingAmount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>合計</td>
              <td className="r">{num(sum(comp, (r) => r.members))}</td>
              <td className="r">{num(sum(comp, (r) => r.users))}</td>
              <td></td>
              <td className="r">{num(sum(comp, (r) => r.visits))}</td>
              <td className="r">{num(sum(comp, (r) => r.pointsUsed))}</td>
              <td></td>
              <td className="r">{yen(billing)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="panel panel-tight table-wrap">
        <h2>施設別の精算額（{fmtPeriod(period)}）</h2>
        <table className="daicho">
          <thead>
            <tr>
              <th>施設</th>
              <th>運営会社</th>
              <th className="r">入館</th>
              <th className="r">利用pt</th>
              <th className="r">店頭収受（参考）</th>
              <th className="r">入館分</th>
              <th className="r">調整</th>
              <th className="r">精算額</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {fac.map((r) => (
              <tr key={r.facilityId}>
                <td>{r.facilityName}</td>
                <td className="small">{r.operatorName}</td>
                <td className="r">{num(r.visits)}</td>
                <td className="r">{num(r.pointsUsed)}</td>
                <td className="r">{yen(r.shortageYen + r.surchargeYen)}</td>
                <td className="r">{yen(r.checkinAmount)}</td>
                <td className="r">{yen(r.adjustmentAmount)}</td>
                <td className="r">
                  <b>{yen(r.totalAmount)}</b>
                </td>
                <td>{r.status ? <StatusHanko status={r.status} /> : <span className="small mute">未集計</span>}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>合計</td>
              <td className="r">{num(sum(fac, (r) => r.visits))}</td>
              <td className="r">{num(sum(fac, (r) => r.pointsUsed))}</td>
              <td className="r">{yen(sum(fac, (r) => r.shortageYen + r.surchargeYen))}</td>
              <td className="r">{yen(sum(fac, (r) => r.checkinAmount))}</td>
              <td className="r">{yen(sum(fac, (r) => r.adjustmentAmount))}</td>
              <td className="r">{yen(payout)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </section>
    </StaffShell>
  );
}
