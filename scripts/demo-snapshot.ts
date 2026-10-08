/**
 * 公開デモ用に、デモデータ入りのデータベースを .demo/snapshot.tar.gz に書き出す。
 * Netlify のビルドで next build の前に実行する（netlify.toml）。
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { DB } from "@/db";
import { seed } from "@/db/seed";

async function main() {
  const started = Date.now();
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  const r = await seed(db as unknown as DB);
  const dump = await client.dumpDataDir("gzip");
  const out = path.join(process.cwd(), ".demo", "snapshot.tar.gz");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(await dump.arrayBuffer()));
  await client.close();
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`デモ用データベースを作成しました: ${out}（${kb}KB、入館 ${r.skipped ? 0 : r.checkins} 件、${Date.now() - started}ms）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
