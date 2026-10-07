import Link from "next/link";
import { asc, count, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { resolveTerm } from "@/lib/pricing";
import { jstDate, WEEKDAYS_JA } from "@/lib/time";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";

export const metadata = { title: "提携施設" };

export default async function FacilitiesAdminPage() {
  const u = await requireStaff(READ);
  const db = await getDb();
  const rows = await db
    .select({ f: schema.facilities, operatorName: schema.operators.name })
    .from(schema.facilities)
    .innerJoin(schema.operators, eq(schema.operators.id, schema.facilities.operatorId))
    .orderBy(asc(schema.facilities.area), asc(schema.facilities.name));
  const ids = rows.map((r) => r.f.id);
  const courseCounts = ids.length
    ? await db.select({ id: schema.courses.facilityId, n: count() }).from(schema.courses).where(inArray(schema.courses.facilityId, ids)).groupBy(schema.courses.facilityId)
    : [];
  const terms = ids.length ? await db.select().from(schema.settlementTerms).where(inArray(schema.settlementTerms.facilityId, ids)) : [];
  const today = jstDate(new Date());
  return (
    <StaffShell
      user={u}
      title="提携施設"
      actions={
        u.role !== "viewer" && (
          <Link href="/admin/facilities/new" className="btn btn-sm btn-primary">
            施設を登録
          </Link>
        )
      }
    >
      <div className="panel panel-tight table-wrap">
        <table className="daicho">
          <thead>
            <tr>
              <th>施設</th>
              <th>エリア</th>
              <th>運営会社</th>
              <th>定休日</th>
              <th className="r">コース</th>
              <th>精算条件</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ f, operatorName }) => {
              const term = resolveTerm(terms.filter((t) => t.facilityId === f.id), "__none__", today);
              return (
                <tr key={f.id} className={f.status === "suspended" ? "is-off" : undefined}>
                  <td>
                    <Link href={`/admin/facilities/${f.id}`}>{f.name}</Link>
                  </td>
                  <td className="small">{f.area}</td>
                  <td className="small">{operatorName}</td>
                  <td className="small">{WEEKDAYS_JA.filter((_, i) => f.closedWeekdays & (1 << i)).join("・") || "なし"}</td>
                  <td className="r">{Number(courseCounts.find((c) => c.id === f.id)?.n ?? 0)}</td>
                  <td className="small">
                    {term ? (
                      term.method === "unit" ? (
                        `定額 ¥${term.unitPrice.toLocaleString()}`
                      ) : (
                        `${term.method === "points_ratio" ? "利用pt" : "定価"}×${term.ratioBp / 100}%`
                      )
                    ) : (
                      <span style={{ color: "var(--shu)", fontWeight: 700 }}>未設定</span>
                    )}
                  </td>
                  <td>{f.status === "active" ? <span className="hanko hanko-take">提携中</span> : <span className="hanko hanko-mute">停止</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </StaffShell>
  );
}
