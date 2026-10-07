import { asc, desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { fmtDateTime } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";
import { noticeAction } from "../actions-ops";

export const metadata = { title: "お知らせ" };

export default async function NoticesAdminPage() {
  const u = await requireStaff(READ);
  const db = await getDb();
  const notices = await db.select().from(schema.notices).orderBy(desc(schema.notices.publishedAt)).limit(100);
  const companies = await db.select().from(schema.companies).orderBy(asc(schema.companies.name));
  const facilities = await db.select().from(schema.facilities).orderBy(asc(schema.facilities.name));
  const now = new Date();
  const target = (n: (typeof notices)[number]) =>
    n.audience === "all"
      ? "全会員"
      : n.audience === "company"
        ? `${companies.find((c) => c.id === n.companyId)?.name ?? ""}の会員`
        : `${facilities.find((f) => f.id === n.facilityId)?.name ?? ""}の利用者`;
  return (
    <StaffShell user={u} title="お知らせ">
      {u.role !== "viewer" && (
        <section className="panel">
          <h2>お知らせを登録</h2>
          <ActionForm action={noticeAction} resetOnOk>
            <input type="hidden" name="op" value="create" />
            <div className="form-grid">
              <label className="field">
                <span>件名</span>
                <input name="title" required />
              </label>
              <label className="field">
                <span>対象</span>
                <select name="audience" defaultValue="all">
                  <option value="all">全会員</option>
                  <option value="company">特定の企業の会員</option>
                  <option value="facility">特定の施設を利用したことのある会員</option>
                </select>
              </label>
              <label className="field">
                <span>企業（対象が企業のとき）</span>
                <select name="companyId" defaultValue="">
                  <option value="">—</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>施設（対象が施設のとき）</span>
                <select name="facilityId" defaultValue="">
                  <option value="">—</option>
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>掲載開始（空欄はすぐ）</span>
                <input type="datetime-local" name="publishedAt" />
              </label>
              <label className="field">
                <span>掲載終了日（任意）</span>
                <input type="date" name="expiresAt" />
              </label>
            </div>
            <label className="field">
              <span>本文</span>
              <textarea name="body" required />
            </label>
            <SubmitButton>登録</SubmitButton>
          </ActionForm>
        </section>
      )}
      <section className="panel panel-tight">
        <h2>登録済み</h2>
        <table className="daicho">
          <thead>
            <tr>
              <th>掲載</th>
              <th>件名</th>
              <th>対象</th>
              <th>状態</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {notices.map((n) => {
              const live = n.publishedAt <= now && (!n.expiresAt || n.expiresAt > now);
              return (
                <tr key={n.id} className={!live && n.publishedAt <= now ? "is-off" : undefined}>
                  <td className="small">{fmtDateTime(n.publishedAt)}</td>
                  <td>
                    <b>{n.title}</b>
                    <div className="small" style={{ whiteSpace: "pre-wrap" }}>
                      {n.body}
                    </div>
                  </td>
                  <td className="small">{target(n)}</td>
                  <td>{n.publishedAt > now ? <span className="hanko hanko-ai">予約</span> : live ? <span className="hanko hanko-take">掲載中</span> : <span className="hanko hanko-mute">終了</span>}</td>
                  <td>
                    {u.role !== "viewer" && (live || n.publishedAt > now) && (
                      <ActionForm action={noticeAction}>
                        <input type="hidden" name="op" value="expire" />
                        <input type="hidden" name="id" value={n.id} />
                        <SubmitButton className="btn btn-sm">掲載終了</SubmitButton>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </StaffShell>
  );
}
