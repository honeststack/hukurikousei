import { requireStaff } from "@/lib/auth";
import { contractOn } from "@/lib/ledger";
import { companyReport } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { getDb } from "@/db";
import { currentPeriod, fmtPeriod, isValidPeriod, lastDayOf, num, yen } from "@/lib/time";
import { PeriodNav } from "@/components/period-nav";
import { StaffShell } from "@/components/staff-shell";

export const metadata = { title: "請求明細" };

export default async function CompanyBillingPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const u = await requireStaff(["company"]);
  const { p } = await searchParams;
  const period = p && isValidPeriod(p) && p <= currentPeriod() ? p : currentPeriod();
  const db = await getDb();
  const [row] = await companyReport(db, period, u.companyId!);
  const contract = await contractOn(db, u.companyId!, lastDayOf(period));
  const s = await getSettings(db);
  const amount = row?.billingAmount ?? 0;
  return (
    <StaffShell
      user={u}
      title="請求明細"
      actions={
        <a className="btn btn-sm" href={`/api/csv/company?kind=billing&p=${period}`}>
          明細CSV
        </a>
      }
    >
      <PeriodNav period={period} basePath="/company/billing" />
      {period === currentPeriod() && <p className="notice">今月分は月の途中のため、見込みの金額です。</p>}
      <section className="panel" style={{ maxWidth: 680 }}>
        <h2>{fmtPeriod(period)}分のご請求</h2>
        <table className="daicho">
          <tbody>
            <tr>
              <th>ご請求の基準</th>
              <td>{!contract ? "契約なし" : contract.billingBasis === "per_member" ? `会員1名あたり ${yen(contract.feePerMember)} × 対象会員数` : `利用ポイント × ${s.yenPerPoint}円`}</td>
            </tr>
            <tr>
              <th>対象会員数</th>
              <td className="r">{num(row?.members ?? 0)}名</td>
            </tr>
            <tr>
              <th>利用ポイント</th>
              <td className="r">{num(row?.pointsUsed ?? 0)}pt</td>
            </tr>
            <tr>
              <th>ご請求額（税込）</th>
              <td className="r" style={{ fontSize: "1.3rem", fontWeight: 700 }}>
                {yen(amount)}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="small mute" style={{ marginTop: 10 }}>
          対象会員数は、その月に1日でも利用可能だった会員の数です。請求書は運営から別途お送りします。
        </p>
      </section>
    </StaffShell>
  );
}
