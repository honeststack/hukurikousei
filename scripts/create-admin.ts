/**
 * 最初の運営管理者を作成し、パスワード設定用のURLを表示する（本番の初期設定用）。
 *   npm run admin:create -- admin@your-company.jp "運営 太郎"
 */
import { sql } from "drizzle-orm";
import { closeDb, getDb, schema } from "@/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { appUrl } from "@/lib/mail";
import { DEFAULT_SETTINGS, saveSettings } from "@/lib/settings";
import { BUILTIN_HOLIDAYS } from "@/lib/holidays";

async function main() {
  const [email, name] = process.argv.slice(2);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
    console.error('使い方: npm run admin:create -- メールアドレス "氏名"');
    process.exit(1);
  }
  const db = await getDb();
  const [dup] = await db.select().from(schema.staffUsers).where(sql`lower(${schema.staffUsers.email}) = ${email.toLowerCase()}`);
  if (dup) {
    console.error("このメールアドレスはすでに登録されています");
    process.exit(1);
  }
  const existingSettings = await db.select().from(schema.settings);
  if (!existingSettings.length) await saveSettings(DEFAULT_SETTINGS, db);
  await db.insert(schema.holidays).values(BUILTIN_HOLIDAYS).onConflictDoNothing();
  const [u] = await db.insert(schema.staffUsers).values({ email: email.toLowerCase(), name, role: "admin" }).returning();
  const token = randomToken(24);
  await db.insert(schema.authTokens).values({
    id: sha256(token),
    kind: "invite",
    subjectKind: "staff",
    subjectId: u.id,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });
  await closeDb();
  console.log(`運営管理者「${name}」を作成しました。14日以内に次のURLでパスワードを設定してください。\n${appUrl(`/staff/invite/${token}`)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
