import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffAuthFrame } from "@/components/staff-auth-frame";
import { getStaffSession, homeForRole } from "@/lib/auth";
import { staffMfaAction, staffLogoutAction } from "../actions";

export const metadata = { title: "2段階認証" };

export default async function MfaPage() {
  const s = await getStaffSession();
  if (!s) redirect("/staff/login");
  if (!s.session.mfaPending) redirect(homeForRole(s.user.role));
  return (
    <StaffAuthFrame title="確認コードの入力">
      <p className="small">認証アプリ（Google Authenticator など）に表示されている6桁の数字を入力してください。</p>
      <ActionForm action={staffMfaAction}>
        <label className="field">
          <span>確認コード</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus
            style={{ fontSize: "1.6rem", letterSpacing: "0.3em", textAlign: "center" }}
          />
        </label>
        <SubmitButton className="btn btn-primary btn-block btn-big">確認</SubmitButton>
      </ActionForm>
      <form action={staffLogoutAction} style={{ marginTop: 20, textAlign: "center" }}>
        <button type="submit" className="btn-link">
          ログインをやめる
        </button>
      </form>
    </StaffAuthFrame>
  );
}
