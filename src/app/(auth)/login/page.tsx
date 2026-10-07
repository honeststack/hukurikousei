import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { getCurrentMember } from "@/lib/auth";
import { memberLoginAction } from "../actions";

export const metadata = { title: "ログイン" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : "";
  if (await getCurrentMember()) redirect(safe || "/m");
  return (
    <>
      <h1 className="auth-title" style={{ textAlign: "center" }}>
        会員証を開く
      </h1>
      <p className="mute small" style={{ textAlign: "center" }}>
        一度ログインすると、次からはこの画面は出ません
      </p>
      {safe.startsWith("/q/") && <p className="notice">ログインすると、読み取った施設のコース選択に進みます。</p>}
      <ActionForm action={memberLoginAction}>
        <input type="hidden" name="next" value={safe} />
        <label className="field">
          <span>メールアドレス</span>
          <input name="email" type="email" autoComplete="username" inputMode="email" required />
        </label>
        <label className="field">
          <span>パスワード</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <SubmitButton className="btn btn-primary btn-block btn-big">ログイン</SubmitButton>
      </ActionForm>
      <p style={{ marginTop: 20, textAlign: "center" }}>
        <Link href="/forgot">パスワードを忘れた方</Link>
      </p>
      <div className="card small" style={{ marginTop: 28 }}>
        <b>はじめての方へ</b>
        <p style={{ margin: "4px 0 0" }}>
          会社から届いた「会員証のご案内」メールのリンクを開いて、パスワードを決めてください。メールが見当たらない場合は、社内のご担当者にお問い合わせください。
        </p>
      </div>
      <p className="small" style={{ marginTop: 40, textAlign: "center" }}>
        <Link href="/staff/login" className="mute">
          企業・施設・運営のご担当者はこちら
        </Link>
      </p>
    </>
  );
}
