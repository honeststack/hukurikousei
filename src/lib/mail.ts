import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL || process.env.URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

/**
 * メール送信。送信記録（outbox）に必ず残し、SMTP_URL があれば送信する。
 * 未設定の開発環境ではコンソールに出力し、運営画面の「送信記録」から本文を確認できる。
 */
export async function sendMail(to: string, subject: string, body: string) {
  const db = await getDb();
  const [row] = await db.insert(schema.outboxEmails).values({ to, subject, body }).returning();
  const smtp = process.env.SMTP_URL;
  if (!smtp) {
    console.info(`[mail] to=${to} subject=${subject}\n${body}\n`);
    return row;
  }
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport(smtp);
    await transport.sendMail({ from: process.env.MAIL_FROM ?? "no-reply@example.com", to, subject, text: body });
    await db.update(schema.outboxEmails).set({ sentAt: new Date() }).where(eq(schema.outboxEmails.id, row.id));
  } catch (e) {
    await db
      .update(schema.outboxEmails)
      .set({ error: e instanceof Error ? e.message : String(e) })
      .where(eq(schema.outboxEmails.id, row.id));
  }
  return row;
}
