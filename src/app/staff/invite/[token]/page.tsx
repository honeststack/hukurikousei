import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { peekAuthToken } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/scope";
import { SetPasswordForm } from "@/components/set-password-form";
import { StaffAuthFrame } from "@/components/staff-auth-frame";

export const metadata = { title: "アカウントの初回設定" };

export default async function StaffInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await peekAuthToken(token, ["invite"]);
  if (!t || t.subjectKind !== "staff") {
    return (
      <StaffAuthFrame title="アカウントの初回設定">
        <p className="notice notice-error">
          このリンクは期限切れか、すでに使われています。<Link href="/staff/login">ログイン</Link>するか、運営に再発行を依頼してください。
        </p>
      </StaffAuthFrame>
    );
  }
  const db = await getDb();
  const [u] = await db.select().from(schema.staffUsers).where(eq(schema.staffUsers.id, t.subjectId));
  return (
    <StaffAuthFrame title="アカウントの初回設定">
      <div className="card small" style={{ marginBottom: 16 }}>
        {u?.name} 様（{u ? ROLE_LABEL[u.role] : ""}）
        <br />
        ログインID：<b>{u?.email}</b>
      </div>
      <SetPasswordForm token={token} cta="パスワードを設定してログイン" />
    </StaffAuthFrame>
  );
}
