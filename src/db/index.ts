import path from "node:path";
import fs from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export type Executor = DB | Tx;

type Holder = { db: Promise<DB>; close: () => Promise<void> };
const g = globalThis as unknown as { __yufudaDb?: Holder };

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/**
 * DATABASE_URL があれば PostgreSQL に接続し、なければ .data/pglite の組込みPostgreSQLを使う。
 * 組込みDBは起動時にマイグレーションを自動適用する（ローカル開発用）。
 */
async function open(): Promise<Holder> {
  const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL;
  const serverless = !!(process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL);
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    // サーバーレスでは関数ごとに接続を持つため、接続数を絞る
    const pool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? (serverless ? 2 : 10)) });
    const db = drizzle(pool, { schema }) as unknown as DB;
    return { db: Promise.resolve(db), close: () => pool.end() };
  }
  if (serverless) {
    throw new Error(
      "DATABASE_URL が設定されていません。Netlify などのサーバーレス環境では組込みDBを使えないため、PostgreSQL の接続文字列を環境変数 DATABASE_URL に設定してください。",
    );
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  let client: InstanceType<typeof PGlite>;
  if (dir === "memory://") {
    client = new PGlite();
  } else {
    fs.mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return { db: Promise.resolve(db as unknown as DB), close: () => client.close() };
}

export function getDb(): Promise<DB> {
  // 公開デモ：外部DBなしで、メモリ上のデモデータを使う（src/db/demo.ts）
  if (process.env.DEMO_MODE === "true" && !process.env.DATABASE_URL && !process.env.NETLIFY_DATABASE_URL) {
    return import("./demo").then((m) => m.getDemoDb());
  }
  if (!g.__yufudaDb) {
    const holder = open();
    const db = holder.then((h) => h.db);
    g.__yufudaDb = {
      db,
      close: async () => (await holder).close(),
    };
    db.catch(() => {
      g.__yufudaDb = undefined;
    });
  }
  return g.__yufudaDb.db;
}

export async function closeDb() {
  if (g.__yufudaDb) {
    const h = g.__yufudaDb;
    g.__yufudaDb = undefined;
    await h.close();
  }
}

export { schema };
