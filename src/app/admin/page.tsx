import Link from "next/link";
import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { todayMark } from "@/lib/daily";
import { companyReport, facilityReport } from "@/lib/reports";
import { addMonths, currentPeriod, fmtDateTime, fmtPeriod, fmtTime, jstDate, jstToDate, num, yen } from "@/lib/time";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "./_ctx";

export const metadata = { title: "運営トップ" };

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const u = await requireStaff(READ);
  const { ok } = await searchParams;
  const db = await getDb();
  const now = new Date();
  const today = jstDate(now);
  const period = currentPeriod(now);
  const since = jstToDate(today, 0);
  const [todayCount] = await db
    .select({ n: count() })
    .from(schema.checkins)
    .where(and(gte(schema.checkins.checkedInAt, since), eq(schema.checkins.status, "active")));
  const comp = await companyReport(db, period);
  const fac = await facilityReport(db, period);
  const prevPeriod = addMonths(period, -1);
  const prevStatements = await db.select().from(schema.statements).where(eq(schema.statements.period, prevPeriod));
  const [flags] = await db
    .select({ n: count() })
    .from(schema.checkins)
    .where(and(sql`jsonb_array_length(${schema.checkins.flags}) > 0`, isNull(schema.checkins.flagsResolvedAt)));
  const [requests] = await db.select({ n: count() }).from(schema.cancelRequests).where(eq(schema.cancelRequests.status, "open"));
  const [changes] = await db.select({ n: count() }).from(schema.changeRequests).where(eq(schema.changeRequests.status, "open"));
  const [run] = await db.select().from(schema.monthlyRuns).where(eq(schema.monthlyRuns.period, period));
  const recent = await db
    .select({ c: schema.checkins, memberName: schema.members.name, facilityName: schema.facilities.name })
    .from(schema.checkins)
    .innerJoin(schema.members, eq(schema.members.id, schema.checkins.memberId))
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.checkins.facilityId))
    .orderBy(desc(schema.checkins.checkedInAt))
    .limit(8);
  const mark = todayMark(now);
  const members = comp.reduce((s, r) => s + r.members, 0);
  const users = comp.reduce((s, r) => s + r.users, 0);
  const todo = [
    !run || run.status !== "done"
      ? { href: "/admin/monthly", text: `今月（${fmtPeriod(period)}）のポイント付与がまだ実行されていません`, warn: true }
      : null,
    Number(flags?.n ?? 0) > 0 ? { href: "/admin/flags", text: `要確認の入館が ${flags?.n}件 あります`, warn: true } : null,
    Number(requests?.n ?? 0) + Number(changes?.n ?? 0) > 0
      ? { href: "/admin/requests", text: `施設からの申請が ${Number(requests?.n ?? 0) + Number(changes?.n ?? 0)}件 あります`, warn: true }
      : null,
    prevStatements.some((s) => s.status === "draft")
      ? { href: `/admin/settlements?p=${prevPeriod}`, text: `${fmtPeriod(prevPeriod)}分の精算で、施設への確認依頼がまだのものがあります`, warn: false }
      : null,
    prevStatements.some((s) => s.status === "review" && s.facilityConfirmedAt)
      ? { href: `/admin/settlements?p=${prevPeriod}`, text: `${fmtPeriod(prevPeriod)}分の精算で、施設の確認が済み確定を待っているものがあります`, warn: false }
      : null,
  ].filter(Boolean) as { href: string; text: string; warn: boolean }[];

  return (
    <StaffShell user={u} title="トップ">
      {ok === "2fa" && <p className="notice notice-ok">2段階認証を設定しました。</p>}
      <div className="stats">
        <div className="stat">
          <div className="stat-label">本日の入館</div>
          <div className="stat-value">
            {num(Number(todayCount?.n ?? 0))}
            <small>件</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">今月の利用人数／会員</div>
          <div className="stat-value">
            {num(users)}
            <small>／{num(members)}名</small>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">今月の精算見込み</div>
          <div className="stat-value">{yen(fac.reduce((s, r) => s + r.totalAmount, 0))}</div>
        </div>
        <div className="stat">
          <div className="stat-label">今月の請求見込み</div>
          <div className="stat-value">{yen(comp.reduce((s, r) => s + r.billingAmount, 0))}</div>
        </div>
        <div className="stat" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            aria-hidden="true"
            style={{ width: 40, height: 40, borderRadius: "50%", background: mark.color.hex, color: mark.color.ink, display: "grid", placeItems: "center", fontFamily: "var(--font-mincho)", fontWeight: 700 }}
          >
            {mark.seal}
          </span>
          <div>
            <div className="stat-label">本日の色と印</div>
            <b>
              {mark.color.name}・{mark.seal}
            </b>
          </div>
        </div>
      </div>

      <section className="panel">
        <h2>やること</h2>
        {todo.length === 0 ? (
          <p className="mute" style={{ margin: 0 }}>
            対応が必要なものはありません。
          </p>
        ) : (
          <ul style={{ margin: 0, paddingLeft: "1.2em" }}>
            {todo.map((t) => (
              <li key={t.href + t.text}>
                <Link href={t.href} style={{ color: t.warn ? "var(--shu)" : undefined, fontWeight: 700 }}>
                  {t.text}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid-2">
        <section className="panel panel-tight">
          <h2>
            直近の入館 <Link href="/admin/checkins" className="small">すべて</Link>
          </h2>
          <table className="daicho">
            <tbody>
              {recent.map(({ c, memberName, facilityName }) => (
                <tr key={c.id} className={c.status === "cancelled" ? "is-off" : undefined}>
                  <td className="small num">
                    {fmtDateTime(c.checkedInAt).slice(5, 10)} {fmtTime(c.checkedInAt)}
                  </td>
                  <td>
                    <Link href={`/admin/checkins/${c.id}`}>{memberName}</Link>
                  </td>
                  <td className="small">{facilityName}</td>
                  <td className="r">{num(c.pointsUsed)}pt</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel panel-tight">
          <h2>
            企業別（{fmtPeriod(period)}） <Link href="/admin/reports" className="small">月次集計</Link>
          </h2>
          <table className="daicho">
            <thead>
              <tr>
                <th>企業</th>
                <th className="r">会員</th>
                <th className="r">利用</th>
                <th className="r">利用率</th>
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
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </StaffShell>
  );
}
