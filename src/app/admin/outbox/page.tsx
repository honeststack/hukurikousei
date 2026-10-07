import { desc } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { requireStaff } from "@/lib/auth";
import { fmtDateTime } from "@/lib/time";
import { StaffShell } from "@/components/staff-shell";

export const metadata = { title: "メール送信記録" };

export default async function OutboxPage() {
  const u = await requireStaff(["admin"]);
  const db = await getDb();
  const mails = await db.select().from(schema.outboxEmails).orderBy(desc(schema.outboxEmails.createdAt)).limit(200);
  const smtp = !!process.env.SMTP_URL;
  return (
    <StaffShell user={u} title="メール送信記録">
      {!smtp && (
        <p className="notice">
          送信サーバー（SMTP_URL）が未設定のため、メールは実際には送信されず、ここに記録されるだけです。本番では環境変数 SMTP_URL を設定してください。
        </p>
      )}
      <p className="small mute">招待・パスワード再設定のリンクを含むため、運営管理者だけが閲覧できます。</p>
      {mails.map((m) => (
        <details className="fold" key={m.id}>
          <summary>
            {fmtDateTime(m.createdAt)}　{m.to}　{m.subject}
            {m.error ? <span className="tag tag-shu" style={{ marginLeft: 8 }}>送信失敗</span> : m.sentAt ? <span className="tag tag-take" style={{ marginLeft: 8 }}>送信済み</span> : <span className="tag tag-mute" style={{ marginLeft: 8 }}>未送信</span>}
          </summary>
          <div>
            {m.error && <p className="notice notice-error">{m.error}</p>}
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0 }}>{m.body}</pre>
          </div>
        </details>
      ))}
    </StaffShell>
  );
}
