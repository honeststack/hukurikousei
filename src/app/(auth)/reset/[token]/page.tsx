import Link from "next/link";
import { peekAuthToken } from "@/lib/auth";
import { SetPasswordForm } from "@/components/set-password-form";

export const metadata = { title: "新しいパスワード" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await peekAuthToken(token, ["reset"]);
  if (!t || t.subjectKind !== "member") {
    return (
      <div className="notice notice-error">
        このリンクは期限切れか、すでに使われています。<Link href="/forgot">もう一度お手続きください</Link>。
      </div>
    );
  }
  return (
    <>
      <h1 className="auth-title" style={{ textAlign: "center" }}>
        新しいパスワード
      </h1>
      <SetPasswordForm token={token} cta="設定してログイン" />
    </>
  );
}
