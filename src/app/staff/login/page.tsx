import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffAuthFrame } from "@/components/staff-auth-frame";
import { getCurrentStaff, homeForRole } from "@/lib/auth";
import { staffLoginAction } from "../actions";

export const metadata = { title: "管理画面ログイン" };

export default async function StaffLoginPage() {
  const u = await getCurrentStaff();
  if (u) redirect(homeForRole(u.role));
  return (
    <StaffAuthFrame title="管理画面にログイン">
      <ActionForm action={staffLoginAction}>
        <label className="field">
          <span>メールアドレス</span>
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label className="field">
          <span>パスワード</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <SubmitButton className="btn btn-primary btn-block btn-big">ログイン</SubmitButton>
      </ActionForm>
      <p style={{ marginTop: 20, textAlign: "center" }}>
        <Link href="/staff/forgot">パスワードを忘れた方</Link>
      </p>
      <p className="small" style={{ marginTop: 32, textAlign: "center" }}>
        <Link href="/login" className="mute">
          会員の方はこちら
        </Link>
      </p>
    </StaffAuthFrame>
  );
}
