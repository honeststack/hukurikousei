import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { contractOn } from "@/lib/ledger";
import { companyReport, memberInPeriod } from "@/lib/reports";
import { addMonths, currentPeriod, fmtPeriod, isValidPeriod, lastDayOf, num } from "@/lib/time";
import { PeriodNav } from "@/components/period-nav";
import { StaffShell } from "@/components/staff-shell";

export const metadata = { title: "利用状況" };

/** 少人数の部署は個人が特定されないよう幅で表示する */
const masked = (n: number, allow: boolean) => (allow || n === 0 || n >= 3 ? num(n) : "1〜2");

export default async function CompanyUsagePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const u = await requireStaff(["company"]);
  const companyId = u.companyId!;
  const { p } = await searchParams;
  const period = p && isValidPeriod(p) && p <= currentPeriod() ? p : currentPeriod();
  const db = await getDb();
  const [row] = await companyReport(db, period, companyId);
  const contract = await contractOn(db, companyId, lastDayOf(period));
  const individual = !!contract?.showIndividualUsage;

  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const per = addMonths(period, -i);
    const [r] = await companyReport(db, per, companyId);
    trend.push({ per, r });
  }

  const deptMembers = await db
    .select({ dept: schema.members.department, n: sql<number>`count(*)` })
    .from(schema.members)
    .where(and(eq(schema.members.companyId, companyId), memberInPeriod(period)))
    .groupBy(schema.members.department);
  const deptUse = await db
    .select({
      dept: schema.members.department,
      users: sql<number>`count(distinct ${schema.checkins.memberId})`,
      visits: sql<number>`count(*)`,
    })
    .from(schema.checkins)
    .innerJoin(schema.members, eq(schema.members.id, schema.checkins.memberId))
    .where(and(eq(schema.checkins.companyId, companyId), eq(schema.checkins.period, period), eq(schema.checkins.status, "active")))
    .groupBy(schema.members.department);

  const people = individual
    ? await db
        .select({
          name: schema.members.name,
          employeeNo: schema.members.employeeNo,
          visits: sql<number>`count(*)`,
          points: sql<number>`sum(${schema.checkins.pointsUsed})`,
        })
        .from(schema.checkins)
        .innerJoin(schema.members, eq(schema.members.id, schema.checkins.memberId))
        .where(and(eq(schema.checkins.companyId, companyId), eq(schema.checkins.period, period), eq(schema.checkins.status, "active")))
        .groupBy(schema.members.name, schema.members.employeeNo)
        .orderBy(schema.members.employeeNo)
    : [];

  return (
    <StaffShell
      user={u}
      title="利用状況"
      actions={
        <a className="btn btn-sm" href={`/api/csv/company?kind=usage&p=${period}`}>
          CSV
        </a>
      }
    >
      <PeriodNav period={period} basePath="/company/usage" />
      <div className="stats">
        <div className="stat">
          <div className="stat-label">会員</div>
          <div className="stat-value">
            {num(row?.members ?? 0)}
            <small>名</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">利用人数</div>
          <div className="stat-value">
            {num(row?.users ?? 0)}
            <small>名</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">利用回数</div>
          <div className="stat-value">
            {num(row?.visits ?? 0)}
            <small>回</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">利用率</div>
          <div className="stat-value">
            {Math.round((row?.usageRate ?? 0) * 100)}
            <small>%</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">利用ポイント</div>
          <div className="stat-value">
            {num(row?.pointsUsed ?? 0)}
            <small>pt</small>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel panel-tight">
          <h2>直近6か月</h2>
          <table className="daicho">
            <thead>
              <tr>
                <th>月</th>
                <th className="r">会員</th>
                <th className="r">利用人数</th>
                <th className="r">回数</th>
                <th className="r">利用率</th>
              </tr>
            </thead>
            <tbody>
              {trend.map(({ per, r }) => (
                <tr key={per}>
                  <td>{fmtPeriod(per)}</td>
                  <td className="r">{num(r?.members ?? 0)}</td>
                  <td className="r">{num(r?.users ?? 0)}</td>
                  <td className="r">{num(r?.visits ?? 0)}</td>
                  <td className="r">{Math.round((r?.usageRate ?? 0) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel panel-tight">
          <h2>部署別（{fmtPeriod(period)}）</h2>
          <table className="daicho">
            <thead>
              <tr>
                <th>部署</th>
                <th className="r">会員</th>
                <th className="r">利用人数</th>
                <th className="r">回数</th>
              </tr>
            </thead>
            <tbody>
              {deptMembers.map((d) => {
                const use = deptUse.find((x) => x.dept === d.dept);
                return (
                  <tr key={d.dept}>
                    <td>{d.dept || "（未設定）"}</td>
                    <td className="r">{num(Number(d.n))}</td>
                    <td className="r">{masked(Number(use?.users ?? 0), individual)}</td>
                    <td className="r">{masked(Number(use?.visits ?? 0), individual)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!individual && <p className="small mute" style={{ padding: "8px 18px" }}>個人が特定されないよう、1〜2名の値は幅で表示しています。</p>}
        </section>
      </div>

      {individual ? (
        <section className="panel panel-tight">
          <h2>個人別（ご契約により開示）</h2>
          <table className="daicho">
            <thead>
              <tr>
                <th>社員番号</th>
                <th>氏名</th>
                <th className="r">回数</th>
                <th className="r">利用ポイント</th>
              </tr>
            </thead>
            <tbody>
              {people.length === 0 && (
                <tr>
                  <td colSpan={4} className="empty">
                    利用はありません
                  </td>
                </tr>
              )}
              {people.map((pp) => (
                <tr key={pp.employeeNo}>
                  <td>{pp.employeeNo}</td>
                  <td>{pp.name}</td>
                  <td className="r">{num(Number(pp.visits))}</td>
                  <td className="r">{num(Number(pp.points))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : (
        <p className="small mute">
          従業員の皆さまが気兼ねなく使えるよう、個人ごとの利用日時や施設は表示していません（ご契約で合意した場合に限り開示できます）。
        </p>
      )}
    </StaffShell>
  );
}
