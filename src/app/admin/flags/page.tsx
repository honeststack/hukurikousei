import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { FLAG_LABELS } from "@/lib/checkin";
import { fmtDateTime, num } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";
import { resolveFlagsAction } from "../actions-ops";

export const metadata = { title: "要確認の入館" };

export default async function FlagsPage() {
  const u = await requireStaff(READ);
  const db = await getDb();
  const rows = await db
    .select({ c: schema.checkins, memberName: schema.members.name, companyName: schema.companies.name, facilityName: schema.facilities.name })
    .from(schema.checkins)
    .innerJoin(schema.members, eq(schema.members.id, schema.checkins.memberId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.checkins.companyId))
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.checkins.facilityId))
    .where(and(sql`jsonb_array_length(${schema.checkins.flags}) > 0`, isNull(schema.checkins.flagsResolvedAt)))
    .orderBy(desc(schema.checkins.checkedInAt))
    .limit(500);
  return (
    <StaffShell user={u} title="要確認の入館">
      <section className="panel">
        <h2>自動で印が付く条件</h2>
        <ul className="small" style={{ margin: 0, paddingLeft: "1.2em" }}>
          <li>
            <b>{FLAG_LABELS.far}</b>：会員が位置情報を許可しており、施設から設定の距離以上離れていた
          </li>
          <li>
            <b>{FLAG_LABELS.shared_device}</b>：過去30日に、同じ端末で別の会員が入館していた（会員証の貸し借りの疑い）
          </li>
          <li>
            <b>{FLAG_LABELS.quick_succession}</b>：3時間以内に別の施設で入館していた
          </li>
          <li>
            <b>{FLAG_LABELS.no_terms}</b>：施設の精算条件が未設定で、精算額が0円になっている
          </li>
        </ul>
      </section>
      <ActionForm action={resolveFlagsAction}>
        <div className="panel panel-tight table-wrap">
          <table className="daicho">
            <thead>
              <tr>
                <th></th>
                <th>入館日時</th>
                <th>会員</th>
                <th>企業</th>
                <th>施設</th>
                <th>内容</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty">
                    未確認のものはありません
                  </td>
                </tr>
              )}
              {rows.map(({ c, memberName, companyName, facilityName }) => (
                <tr key={c.id} className={c.status === "cancelled" ? "is-off" : undefined}>
                  <td>
                    <input type="checkbox" name="checkinId" value={c.id} aria-label="選択" style={{ width: 18, height: 18 }} />
                  </td>
                  <td className="small">
                    <Link href={`/admin/checkins/${c.id}`}>{fmtDateTime(c.checkedInAt)}</Link>
                  </td>
                  <td>{memberName}</td>
                  <td className="small">{companyName}</td>
                  <td className="small">{facilityName}</td>
                  <td className="small" style={{ color: "var(--shu)" }}>
                    {c.flags.map((x) => FLAG_LABELS[x] ?? x).join("、")}
                    {c.distanceM != null && c.flags.includes("far") && `（約${num(c.distanceM)}m）`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {u.role !== "viewer" && rows.length > 0 && (
          <div className="filters">
            <label className="field">
              <span>確認結果のメモ（選んだものすべてに記録）</span>
              <input name="note" placeholder="例：施設に確認済み" style={{ minWidth: 320 }} />
            </label>
            <SubmitButton className="btn btn-sm">選んだものを確認済みにする</SubmitButton>
          </div>
        )}
      </ActionForm>
    </StaffShell>
  );
}
