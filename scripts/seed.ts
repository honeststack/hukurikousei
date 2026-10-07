/** デモデータを投入する（既にデータがある場合は何もしない） */
import { closeDb, getDb } from "@/db";
import { seed, DEMO_PASSWORD } from "@/db/seed";

async function main() {
  const db = await getDb();
  const r = await seed(db);
  await closeDb();
  if (r.skipped) {
    console.log("データが既にあるため、デモデータは投入しませんでした（作り直す場合は npm run db:reset）");
    return;
  }
  console.log(`デモデータを投入しました（過去の入館 ${r.checkins} 件）`);
  console.log(`
ログイン（パスワードはすべて ${DEMO_PASSWORD}）
  会員       http://localhost:3000/login        demo@example.com
  運営       http://localhost:3000/staff/login  admin@example.com
  導入企業   http://localhost:3000/staff/login  hr@sample-shoji.example
  提携施設   http://localhost:3000/staff/login  front@yukemuri.example
施設QR（会員でログインした状態で開く）
  http://localhost:3000/q/demo-minato-front
  http://localhost:3000/q/demo-mori-front
  http://localhost:3000/q/demo-matsu-bandai`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
