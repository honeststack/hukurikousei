import { ActionForm, SubmitButton } from "./action-form";
import { setPasswordAction } from "@/app/(auth)/actions";

export function SetPasswordForm({ token, first, cta }: { token: string; first?: boolean; cta: string }) {
  return (
    <ActionForm action={setPasswordAction}>
      <input type="hidden" name="token" value={token} />
      {first && <input type="hidden" name="first" value="1" />}
      <label className="field">
        <span>パスワード</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
        <span className="hint">8文字以上で、英字と数字を両方含めてください</span>
      </label>
      <label className="field">
        <span>パスワード（確認のためもう一度）</span>
        <input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <SubmitButton className="btn btn-primary btn-block btn-big">{cta}</SubmitButton>
    </ActionForm>
  );
}
