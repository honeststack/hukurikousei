import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { generateURI } from "otplib";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { StaffAuthFrame } from "@/components/staff-auth-frame";
import { getCurrentStaff, homeForRole } from "@/lib/auth";
import { enableTotpAction, startTotpSetupAction } from "../actions";

export const metadata = { title: "2段階認証の設定" };

export default async function TotpSetupPage() {
  const u = await getCurrentStaff();
  if (!u) redirect("/staff/login");
  if (u.totpEnabled) redirect(homeForRole(u.role));
  if (!u.totpSecret) {
    return (
      <StaffAuthFrame title="2段階認証の設定">
        <p className="small">
          ログインのたびに、スマートフォンの認証アプリに表示される6桁の数字を入力する設定です。パスワードが漏れても、第三者はログインできなくなります。
        </p>
        <form action={startTotpSetupAction}>
          <button type="submit" className="btn btn-primary btn-block btn-big">
            設定をはじめる
          </button>
        </form>
      </StaffAuthFrame>
    );
  }
  const uri = generateURI({ issuer: "湯札", label: u.email, secret: u.totpSecret });
  const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220 });
  return (
    <StaffAuthFrame title="2段階認証の設定">
      <ol className="small" style={{ paddingLeft: "1.2em" }}>
        <li>スマートフォンに認証アプリ（Google Authenticator、Microsoft Authenticator など）を入れます</li>
        <li>アプリで下のQRコードを読み取ります</li>
        <li>アプリに表示された6桁の数字を入力します</li>
      </ol>
      <div style={{ textAlign: "center", margin: "12px 0" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="認証アプリ用のQRコード" width={220} height={220} style={{ background: "#fff", padding: 8 }} />
        <p className="small mute" style={{ wordBreak: "break-all" }}>
          手入力用のキー：<code>{u.totpSecret}</code>
        </p>
      </div>
      <ActionForm action={enableTotpAction}>
        <label className="field">
          <span>確認コード（6桁）</span>
          <input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required style={{ fontSize: "1.4rem", letterSpacing: "0.3em", textAlign: "center" }} />
        </label>
        <SubmitButton className="btn btn-primary btn-block">設定を完了する</SubmitButton>
      </ActionForm>
    </StaffAuthFrame>
  );
}
