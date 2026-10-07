import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { memberLogoutAction } from "@/app/(auth)/actions";
import { memberPasswordAction } from "../actions";
import { LocationPermission } from "./location";

export const metadata = { title: "その他" };

export default async function AccountPage() {
  const member = await requireMember("/m/account");
  const s = await getSettings();
  return (
    <>
      <h1 className="m-h1">その他</h1>
      <ul className="list">
        <li>
          <Link className="list-link list-row" href="/m/notices">
            <span>お知らせ</span>
            <span aria-hidden="true">›</span>
          </Link>
        </li>
        <li>
          <Link className="list-link list-row" href="/m/guide">
            <span>使い方・ホーム画面への追加</span>
            <span aria-hidden="true">›</span>
          </Link>
        </li>
        <li>
          <Link className="list-link list-row" href="/terms">
            <span>利用規約</span>
            <span aria-hidden="true">›</span>
          </Link>
        </li>
        <li>
          <Link className="list-link list-row" href="/privacy">
            <span>個人情報の取り扱い</span>
            <span aria-hidden="true">›</span>
          </Link>
        </li>
      </ul>

      <section className="m-section">
        <h2>会員情報</h2>
        <dl className="kv">
          <dt>お名前</dt>
          <dd>{member.name}</dd>
          <dt>会社</dt>
          <dd>{member.companyName}</dd>
          <dt>社員番号</dt>
          <dd>{member.employeeNo}</dd>
          <dt>メール</dt>
          <dd style={{ wordBreak: "break-all" }}>{member.email}</dd>
        </dl>
        <p className="small mute" style={{ marginTop: 8 }}>
          登録内容の変更は、社内のご担当者にご依頼ください。
        </p>
      </section>

      <section className="m-section">
        <h2>位置情報</h2>
        <p className="small">
          許可すると、入館のときに施設の近くにいることを確認します（なりすまし防止）。位置は入館の時点の1回だけ記録し、それ以外には使いません。
        </p>
        <LocationPermission />
      </section>

      <section className="m-section">
        <h2>パスワードの変更</h2>
        <ActionForm action={memberPasswordAction} resetOnOk>
          <label className="field">
            <span>現在のパスワード</span>
            <input name="current" type="password" autoComplete="current-password" required />
          </label>
          <label className="field">
            <span>新しいパスワード</span>
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
            <span className="hint">8文字以上で、英字と数字を両方含めてください</span>
          </label>
          <label className="field">
            <span>新しいパスワード（確認）</span>
            <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <SubmitButton className="btn btn-block">変更する</SubmitButton>
        </ActionForm>
      </section>

      <section className="m-section">
        <h2>お問い合わせ</h2>
        <p className="small" style={{ margin: 0 }}>
          {s.supportName}
          <br />
          電話 <a href={`tel:${s.supportPhone.replace(/[^0-9+]/g, "")}`}>{s.supportPhone}</a>（{s.supportHours}）
          <br />
          メール <a href={`mailto:${s.supportEmail}`}>{s.supportEmail}</a>
        </p>
      </section>

      <form action={memberLogoutAction} style={{ marginTop: 28 }}>
        <button type="submit" className="btn btn-block">
          ログアウト
        </button>
      </form>
    </>
  );
}
