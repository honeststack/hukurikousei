/** ローカルの組込みDB（PGlite）を削除して作り直し、デモデータを入れる */
import fs from "node:fs";
import path from "node:path";

if (process.env.DATABASE_URL) {
  console.error("DATABASE_URL が設定されています。本番・共有DBは削除しません。");
  process.exit(1);
}
const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
fs.rmSync(dir, { recursive: true, force: true });
console.log(`削除しました: ${dir}`);
void import("./seed");
