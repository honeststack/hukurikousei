import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffShell } from "@/components/staff-shell";
import { ROLE_LABEL } from "@/lib/scope";
import { fmtDateTime } from "@/lib/time";
import { disableTotpAction, staffPasswordAction } from "../actions";

export const metadata = { title: "アカウント" };

export default async function StaffAccountPage() {
  const u = await requireStaff(["admin", "operator", "viewer", "company", "facility"]);
  return (
    <StaffShell user={u} title="アカウント">
      <div className="grid-2">
        <section className="panel">
          <h2>登録内容</h2>
          <dl className="kv">
            <dt>お名前</dt>
            <dd>{u.name}</dd>
            <dt>ログインID</dt>
            <dd>{u.email}</dd>
            <dt>権限</dt>
            <dd>{ROLE_LABEL[u.role]}</dd>
            <dt>前回ログイン</dt>
            <dd>{fmtDateTime(u.lastLoginAt)}</dd>
          </dl>
        </section>
        <section className="panel">
          <h2>2段階認証</h2>
          {u.totpEnabled ? (
            <>
              <p>
                <span className="hanko hanko-take">設定済み</span>
              </p>
              <ActionForm action={disableTotpAction}>
                <label className="field">
                  <span>解除する場合は確認コードを入力</span>
                  <input name="code" inputMode="numeric" maxLength={7} required />
                </label>
                <SubmitButton className="btn btn-danger btn-sm">2段階認証を解除</SubmitButton>
              </ActionForm>
            </>
          ) : (
            <>
              <p className="small">ログイン時に、スマートフォンの認証アプリの6桁の数字も確認します。運営アカウントは設定を推奨します。</p>
              <Link href="/staff/2fa-setup" className="btn btn-primary btn-sm">
                設定する
              </Link>
            </>
          )}
        </section>
      </div>
      <section className="panel" style={{ maxWidth: 520 }}>
        <h2>パスワードの変更</h2>
        <ActionForm action={staffPasswordAction} resetOnOk>
          <label className="field">
            <span>現在のパスワード</span>
            <input name="current" type="password" autoComplete="current-password" required />
          </label>
          <label className="field">
            <span>新しいパスワード</span>
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <label className="field">
            <span>新しいパスワード（確認）</span>
            <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <SubmitButton>変更する</SubmitButton>
        </ActionForm>
      </section>
    </StaffShell>
  );
}
