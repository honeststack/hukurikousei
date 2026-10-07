/** マイグレーションを適用する。PGlite は getDb() の初回接続で自動適用される。 */
import path from "node:path";
import { closeDb, getDb } from "@/db";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const pool = new Pool({ connectionString: url });
    await migrate(drizzle(pool), { migrationsFolder: path.join(process.cwd(), "drizzle") });
    await pool.end();
  } else {
    await getDb();
    await closeDb();
  }
  console.log("マイグレーションを適用しました");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
