import { asc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/scope";
import { fmtDateTime } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { READ } from "../_ctx";
import { createStaffAction, staffUserOpAction } from "../actions-org";

export const metadata = { title: "担当者アカウント" };

export default async function UsersPage() {
  const u = await requireStaff(READ);
  const db = await getDb();
  const users = await db.select().from(schema.staffUsers).orderBy(asc(schema.staffUsers.role), asc(schema.staffUsers.name));
  const companies = await db.select().from(schema.companies).orderBy(asc(schema.companies.name));
  const operators = await db.select().from(schema.operators).orderBy(asc(schema.operators.name));
  const isAdmin = u.role === "admin";
  const org = (x: (typeof users)[number]) =>
    x.role === "company" ? companies.find((c) => c.id === x.companyId)?.name : x.role === "facility" ? operators.find((o) => o.id === x.operatorId)?.name : "運営";
  const op = (id: string, name: string, label: string, cls = "btn btn-sm") => (
    <ActionForm action={staffUserOpAction}>
      <input type="hidden" name="userId" value={id} />
      <input type="hidden" name="op" value={name} />
      <SubmitButton className={cls}>{label}</SubmitButton>
    </ActionForm>
  );
  return (
    <StaffShell user={u} title="担当者アカウント">
      <section className="panel panel-tight table-wrap">
        <table className="daicho">
          <thead>
            <tr>
              <th>氏名</th>
              <th>ログインID</th>
              <th>権限</th>
              <th>所属</th>
              <th>2段階認証</th>
              <th>最終ログイン</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((x) => (
              <tr key={x.id} className={x.active ? undefined : "is-off"}>
                <td>{x.name}</td>
                <td className="small">{x.email}</td>
                <td className="small">{ROLE_LABEL[x.role]}</td>
                <td className="small">{org(x)}</td>
                <td>{x.totpEnabled ? <span className="hanko hanko-take">設定済</span> : <span className="small mute">未設定</span>}</td>
                <td className="small">{x.passwordHash ? fmtDateTime(x.lastLoginAt) : "初回設定まだ"}</td>
                <td className="row-actions">
                  {isAdmin && x.id !== u.id && (
                    <>
                      {!x.passwordHash && op(x.id, "invite", "招待を再送")}
                      {x.totpEnabled && op(x.id, "reset2fa", "2段階認証を解除")}
                      {x.active ? op(x.id, "deactivate", "利用停止", "btn btn-sm btn-danger") : op(x.id, "activate", "利用再開")}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {isAdmin && (
        <section className="panel">
          <h2>アカウントを追加</h2>
          <p className="small">登録したメールアドレスに、パスワード設定のリンクを送ります。企業・施設の担当者は、各企業・運営会社の画面からも追加できます。</p>
          <ActionForm action={createStaffAction} resetOnOk>
            <div className="form-grid">
              <label className="field">
                <span>氏名</span>
                <input name="name" required />
              </label>
              <label className="field">
                <span>メール（ログインID）</span>
                <input name="email" type="email" required />
              </label>
              <label className="field">
                <span>権限</span>
                <select name="role" defaultValue="operator">
                  <option value="admin">{ROLE_LABEL.admin}（設定・精算確定・アカウント管理）</option>
                  <option value="operator">{ROLE_LABEL.operator}（日々の運用。精算確定は不可）</option>
                  <option value="viewer">{ROLE_LABEL.viewer}</option>
                  <option value="company">{ROLE_LABEL.company}</option>
                  <option value="facility">{ROLE_LABEL.facility}</option>
                </select>
              </label>
              <label className="field">
                <span>企業（導入企業の場合）</span>
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
                <span>運営会社（提携施設の場合）</span>
                <select name="operatorId" defaultValue="">
                  <option value="">—</option>
                  {operators.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <SubmitButton>追加して招待</SubmitButton>
          </ActionForm>
        </section>
      )}
    </StaffShell>
  );
}
