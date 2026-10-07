import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { memberForgotAction } from "../actions";

export const metadata = { title: "パスワードの再設定" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="auth-title" style={{ textAlign: "center" }}>
        パスワードの再設定
      </h1>
      <p className="small">ご登録のメールアドレスに、再設定のリンクをお送りします。</p>
      <ActionForm action={memberForgotAction}>
        <label className="field">
          <span>メールアドレス</span>
          <input name="email" type="email" autoComplete="username" inputMode="email" required />
        </label>
        <SubmitButton className="btn btn-primary btn-block btn-big">送信する</SubmitButton>
      </ActionForm>
      <p style={{ marginTop: 20, textAlign: "center" }}>
        <Link href="/login">ログインに戻る</Link>
      </p>
    </>
  );
}
