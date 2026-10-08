import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffAuthFrame } from "@/components/staff-auth-frame";
import { getCurrentStaff, homeForRole } from "@/lib/auth";
import { DemoAccounts } from "@/components/demo-hint";
import { staffLoginAction } from "../actions";

export const metadata = { title: "管理画面ログイン" };

export default async function StaffLoginPage() {
  const u = await getCurrentStaff();
  if (u) redirect(homeForRole(u.role));
  return (
    <StaffAuthFrame title="管理画面にログイン">
      {process.env.DEMO_MODE === "true" && (
        <DemoAccounts
          accounts={[
            { label: "運営（管理者）", email: "admin@example.com" },
            { label: "導入企業（人事）", email: "hr@sample-shoji.example" },
            { label: "提携施設（受付）", email: "front@yukemuri.example" },
          ]}
        />
      )}
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
