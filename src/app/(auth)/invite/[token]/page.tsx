import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { peekAuthToken } from "@/lib/auth";
import { SetPasswordForm } from "@/components/set-password-form";

export const metadata = { title: "会員証の初回設定" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await peekAuthToken(token, ["invite"]);
  if (!t || t.subjectKind !== "member") {
    return (
      <div className="notice notice-error">
        このリンクは期限切れか、すでに使われています。設定済みの方は<Link href="/login">ログイン</Link>
        してください。リンクの再送は社内のご担当者にご依頼ください。
      </div>
    );
  }
  const db = await getDb();
  const [row] = await db
    .select({ name: schema.members.name, company: schema.companies.name, email: schema.members.email })
    .from(schema.members)
    .innerJoin(schema.companies, eq(schema.companies.id, schema.members.companyId))
    .where(eq(schema.members.id, t.subjectId));
  return (
    <>
      <h1 className="auth-title" style={{ textAlign: "center" }}>
        ようこそ、{row?.name} さん
      </h1>
      <p className="small" style={{ textAlign: "center" }}>
        {row?.company} の福利厚生「湯札」の会員証をお作りします。
        <br />
        パスワードを決めると、すぐに会員証が表示されます。
      </p>
      <div className="card small" style={{ margin: "16px 0" }}>
        ログインに使うメールアドレス：<b>{row?.email}</b>
      </div>
      <SetPasswordForm token={token} first cta="会員証をつくる" />
    </>
  );
}
