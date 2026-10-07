import Link from "next/link";
import { peekAuthToken } from "@/lib/auth";
import { SetPasswordForm } from "@/components/set-password-form";
import { StaffAuthFrame } from "@/components/staff-auth-frame";

export const metadata = { title: "新しいパスワード" };

export default async function StaffResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await peekAuthToken(token, ["reset"]);
  return (
    <StaffAuthFrame title="新しいパスワード">
      {!t || t.subjectKind !== "staff" ? (
        <p className="notice notice-error">
          このリンクは期限切れか、すでに使われています。<Link href="/staff/forgot">もう一度お手続きください</Link>。
        </p>
      ) : (
        <SetPasswordForm token={token} cta="設定してログイン" />
      )}
    </StaffAuthFrame>
  );
}
