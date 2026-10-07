import Link from "next/link";
import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { contractOn } from "@/lib/ledger";
import { companyReport } from "@/lib/reports";
import { currentPeriod, jstDate, num, yen } from "@/lib/time";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";

export const metadata = { title: "導入企業" };

export default async function CompaniesPage() {
  const u = await requireStaff(READ);
  const db = await getDb();
  const companies = await db.select().from(schema.companies).orderBy(asc(schema.companies.name));
  const report = await companyReport(db, currentPeriod());
  const today = jstDate(new Date());
  const rows = [];
  for (const c of companies) rows.push({ c, contract: await contractOn(db, c.id, today), r: report.find((x) => x.companyId === c.id) });
  return (
    <StaffShell
      user={u}
      title="導入企業"
      actions={
        u.role !== "viewer" && (
          <Link href="/admin/companies/new" className="btn btn-sm btn-primary">
            企業を登録
          </Link>
        )
      }
    >
      <div className="panel panel-tight table-wrap">
        <table className="daicho">
          <thead>
            <tr>
              <th>企業</th>
              <th>ご担当</th>
              <th className="r">毎月の付与</th>
              <th>請求</th>
              <th className="r">会員（今月）</th>
              <th className="r">利用率（今月）</th>
              <th>契約</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="empty">
                  企業は登録されていません
                </td>
              </tr>
            )}
            {rows.map(({ c, contract, r }) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/admin/companies/${c.id}`}>{c.name}</Link>
                </td>
                <td className="small">
                  {c.contactName}
                  <div className="mute">{c.contactEmail}</div>
                </td>
                <td className="r">{contract ? `${num(contract.monthlyPoints)}pt` : "—"}</td>
                <td className="small">{contract ? (contract.billingBasis === "per_member" ? `1名 ${yen(contract.feePerMember)}` : "利用分") : "—"}</td>
                <td className="r">{num(r?.members ?? 0)}</td>
                <td className="r">{Math.round((r?.usageRate ?? 0) * 100)}%</td>
                <td>{contract ? <span className="hanko hanko-take">契約中</span> : <span className="hanko hanko-mute">契約なし</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StaffShell>
  );
}
