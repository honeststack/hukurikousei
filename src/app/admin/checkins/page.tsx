import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { FLAG_LABELS } from "@/lib/checkin";
import { normalizeCheckinFilter, searchCheckins, type CheckinFilter } from "@/lib/checkin-query";
import { fmtDateTime, fmtShortDate, jstDate, num, yen } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";
import { proxyCheckinAction } from "../actions-ops";

export const metadata = { title: "入館記録" };

export default async function AdminCheckinsPage({ searchParams }: { searchParams: Promise<CheckinFilter> }) {
  const u = await requireStaff(READ);
  const f = normalizeCheckinFilter(await searchParams);
  const rows = await searchCheckins(f);
  const db = await getDb();
  const companies = await db.select().from(schema.companies).orderBy(asc(schema.companies.name));
  const facilities = await db.select().from(schema.facilities).orderBy(asc(schema.facilities.name));
  const qrs = await db.select({ q: schema.facilityQrs, name: schema.facilities.name }).from(schema.facilityQrs).innerJoin(schema.facilities, eq(schema.facilities.id, schema.facilityQrs.facilityId));
  const courses = await db.select().from(schema.courses).orderBy(asc(schema.courses.sort));
  const active = rows.filter((r) => r.c.status === "active");
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <StaffShell
      user={u}
      title="入館記録"
      actions={
        <a className="btn btn-sm" href={`/api/csv/checkins?${qs}`}>
          CSV出力
        </a>
      }
    >
      <form className="filters" method="get">
        <label className="field">
          <span>営業日（から）</span>
          <input type="date" name="from" defaultValue={f.from} />
        </label>
        <label className="field">
          <span>（まで）</span>
          <input type="date" name="to" defaultValue={f.to} />
        </label>
        <label className="field">
          <span>企業</span>
          <select name="company" defaultValue={f.company ?? ""}>
            <option value="">すべて</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>施設</span>
          <select name="facility" defaultValue={f.facility ?? ""}>
            <option value="">すべて</option>
            {facilities.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>会員</span>
          <input name="q" defaultValue={f.q} placeholder="氏名・社員番号" />
        </label>
        <label className="field">
          <span>状態</span>
          <select name="status" defaultValue={f.status ?? ""}>
            <option value="">すべて</option>
            <option value="active">有効</option>
            <option value="cancelled">取消</option>
          </select>
        </label>
        <label className="field">
          <span>要確認</span>
          <select name="flagged" defaultValue={f.flagged ?? ""}>
            <option value="">すべて</option>
            <option value="1">印あり</option>
            <option value="open">未確認のみ</option>
          </select>
        </label>
        <button type="submit" className="btn btn-sm">
          絞り込む
        </button>
      </form>
      <p className="small mute">
        {num(rows.length)}件（有効 {num(active.length)}件・使用 {num(active.reduce((s, r) => s + r.c.pointsUsed, 0))}pt・精算 {yen(active.reduce((s, r) => s + r.c.settlementAmount, 0))}）
        {rows.length >= 1000 && "　※1,000件まで表示しています。期間を絞るかCSVで出力してください"}
      </p>
      <div className="panel panel-tight table-wrap">
        <table className="daicho">
          <thead>
            <tr>
              <th>入館日時</th>
              <th>営業日</th>
              <th>会員</th>
              <th>企業</th>
              <th>施設</th>
              <th>コース</th>
              <th className="r">使用pt</th>
              <th className="r">店頭収受</th>
              <th className="r">精算額</th>
              <th>状態</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} className="empty">
                  該当する入館はありません
                </td>
              </tr>
            )}
            {rows.map(({ c, memberName, employeeNo, companyName, facilityName }) => (
              <tr key={c.id} className={c.status === "cancelled" ? "is-off" : undefined}>
                <td className="small num">
                  <Link href={`/admin/checkins/${c.id}`}>{fmtDateTime(c.checkedInAt)}</Link>
                </td>
                <td className="small">{fmtShortDate(c.businessDate)}</td>
                <td>
                  {memberName}
                  <div className="small mute">{employeeNo}</div>
                </td>
                <td className="small">{companyName}</td>
                <td className="small">{facilityName}</td>
                <td className="small">{c.courseName}</td>
                <td className="r">{num(c.pointsUsed)}</td>
                <td className="r">{yen(c.shortageYen + c.surchargeYen)}</td>
                <td className="r">{yen(c.settlementAmount)}</td>
                <td>
                  {c.status === "cancelled" ? <span className="hanko hanko-shu">取消</span> : <span className="hanko hanko-take">有効</span>}
                  {c.flags.length > 0 && (
                    <div className="small" style={{ color: c.flagsResolvedAt ? "var(--ink-mute)" : "var(--shu)" }} title={c.flags.map((x) => FLAG_LABELS[x] ?? x).join("、")}>
                      要確認{c.flagsResolvedAt ? "（済）" : ""}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {u.role !== "viewer" && (
        <details className="fold">
          <summary>障害時の代理登録（施設が紙で控えた入館を登録）</summary>
          <div>
            <p className="small">システムが使えなかった時間帯の入館を、施設の控えをもとに登録します。今月の入館のみ登録でき、通常の入館と同じ計算でポイントを差し引きます。</p>
            <ActionForm action={proxyCheckinAction}>
              <div className="form-grid">
                <label className="field">
                  <span>会員ID</span>
                  <input name="memberId" required placeholder="会員の詳細画面に表示されるID" />
                </label>
                <label className="field">
                  <span>施設</span>
                  <select name="qrId" required>
                    {qrs
                      .filter((q) => !q.q.revokedAt)
                      .map((q) => (
                        <option key={q.q.id} value={q.q.id}>
                          {q.name}（{q.q.label}）
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field">
                  <span>コース</span>
                  <select name="courseId" required>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {facilities.find((x) => x.id === c.facilityId)?.name}：{c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>入館日</span>
                  <input type="date" name="date" defaultValue={jstDate(new Date())} required />
                </label>
                <label className="field">
                  <span>時刻</span>
                  <input name="time" placeholder="18:30" required />
                </label>
                <label className="field">
                  <span>理由</span>
                  <input name="reason" required placeholder="例：通信障害のため施設控えより登録" />
                </label>
              </div>
              <SubmitButton>代理登録する</SubmitButton>
            </ActionForm>
          </div>
        </details>
      )}
    </StaffShell>
  );
}
