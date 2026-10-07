import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffAuthFrame } from "@/components/staff-auth-frame";
import { staffForgotAction } from "../actions";

export const metadata = { title: "パスワードの再設定" };

export default function StaffForgotPage() {
  return (
    <StaffAuthFrame title="パスワードの再設定">
      <ActionForm action={staffForgotAction}>
        <label className="field">
          <span>メールアドレス</span>
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <SubmitButton className="btn btn-primary btn-block">再設定のメールを送る</SubmitButton>
      </ActionForm>
      <p style={{ marginTop: 20, textAlign: "center" }}>
        <Link href="/staff/login">ログインに戻る</Link>
      </p>
    </StaffAuthFrame>
  );
}
