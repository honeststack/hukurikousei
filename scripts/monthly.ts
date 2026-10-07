/** 定期処理（失効→付与、精算の仮集計）。毎日1回、cron などから実行する。 */
import { closeDb, getDb } from "@/db";
import { runDaily } from "@/lib/monthly";

async function main() {
  const db = await getDb();
  const r = await runDaily(db);
  await closeDb();
  console.log(`${r.period}: 会員 ${r.members} 名を処理（付与 ${r.granted}・失効 ${r.expired}・停止 ${r.revoked}）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
