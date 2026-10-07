import "server-only";
import { getDb, schema } from "@/db";
import type { Actor } from "./audit";
import { decodeCsvBytes } from "./csv";
import { planImport } from "./members";
import { jstDate } from "./time";

/** アップロードされたCSVを検証し、プレビュー用の下書きを保存する */
export async function createImportPreview(fd: FormData, companyId: string, actor: Actor): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "CSVファイルを選んでください" };
  if (file.size > 5 * 1024 * 1024) return { ok: false, message: "ファイルが大きすぎます（5MBまで）" };
  const text = decodeCsvBytes(await file.arrayBuffer());
  const missingAction = fd.get("missingAction") === "stop" ? "stop" : "keep";
  const db = await getDb();
  const r = await planImport(db, companyId, text, { missingAction, today: jstDate(new Date()) });
  if (!r.ok) return { ok: false, message: r.message };
  const [row] = await db
    .insert(schema.memberImports)
    .values({ companyId, createdBy: actor.name, fileName: file.name.slice(0, 120), plan: r.plan })
    .returning();
  return { ok: true, id: row.id };
}
