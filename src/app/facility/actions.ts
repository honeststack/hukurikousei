"use server";

import { flash } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import type { ActionState } from "@/components/action-form";
import { getDb, schema } from "@/db";
import { requestMeta, requireStaff, staffActor } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { cancelCheckin } from "@/lib/checkin";
import { facilityIdsFor } from "@/lib/scope";
import { facilityConfirm, facilityDispute } from "@/lib/statements";
import { isValidYmd } from "@/lib/time";

async function ctx() {
  const u = await requireStaff(["facility"]);
  const ids = await facilityIdsFor(u);
  const meta = await requestMeta();
  return { u, ids, actor: staffActor(u, meta.ip), db: await getDb() };
}

export async function facilityCancelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { ids, actor, db } = await ctx();
  const r = await cancelCheckin(db, String(fd.get("checkinId")), { kind: "facility", actor, facilityIds: ids }, String(fd.get("reason") ?? ""));
  if (!r.ok) return { error: r.message };
  revalidatePath("/facility");
  return flash("入館を取り消しました。会員のポイントは戻りました。");
}

export async function cancelRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { u, ids, actor, db } = await ctx();
  const checkinId = String(fd.get("checkinId"));
  const reason = String(fd.get("reason") ?? "").trim();
  if (!reason) return { error: "理由を入力してください" };
  const [c] = await db.select().from(schema.checkins).where(eq(schema.checkins.id, checkinId));
  if (!c || !ids.includes(c.facilityId)) return { error: "入館記録が見つかりません" };
  if (c.status === "cancelled") return { error: "この入館はすでに取り消されています" };
  const open = await db.select().from(schema.cancelRequests).where(eq(schema.cancelRequests.checkinId, c.id));
  if (open.some((o) => o.status === "open")) return { error: "この入館はすでに取消申請中です" };
  const [row] = await db.insert(schema.cancelRequests).values({ checkinId: c.id, requestedBy: u.id, reason }).returning();
  await audit(actor, "cancel_request.create", "cancel_request", row.id, { checkinId: c.id, reason }, db);
  revalidatePath("/facility/history");
  return flash("運営に取消を申請しました。結果は「変更・取消の申請」で確認できます。");
}

export async function changeRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { u, ids, actor, db } = await ctx();
  const facilityId = String(fd.get("facilityId"));
  if (!ids.includes(facilityId)) return { error: "施設を選んでください" };
  const category = String(fd.get("category") ?? "その他");
  const body = String(fd.get("body") ?? "").trim();
  const effectiveOn = String(fd.get("effectiveOn") ?? "");
  if (!body) return { error: "内容を入力してください" };
  if (effectiveOn && !isValidYmd(effectiveOn)) return { error: "適用日を正しく入力してください" };
  const [row] = await db
    .insert(schema.changeRequests)
    .values({ facilityId, requestedBy: u.id, category, body, effectiveOn: effectiveOn || null })
    .returning();
  await audit(actor, "change_request.create", "change_request", row.id, { category }, db);
  revalidatePath("/facility/requests");
  return { ok: "運営に申請しました。反映されると、この画面の状態が「反映済み」になります。" };
}

async function ownStatement(id: string) {
  const { ids, actor, db } = await ctx();
  const [st] = await db.select().from(schema.statements).where(eq(schema.statements.id, id));
  if (!st || !ids.includes(st.facilityId)) throw new Error("明細が見つかりません");
  return { st, actor, db };
}

export async function confirmStatementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { st, actor, db } = await ownStatement(String(fd.get("statementId")));
  const r = await facilityConfirm(db, st.id, actor);
  if (!r.ok) return { error: r.message };
  revalidatePath(`/facility/settlements/${st.id}`);
  return flash("内容を確認済みにしました。運営が確定すると支払通知書を出力できます。");
}

export async function disputeStatementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { st, actor, db } = await ownStatement(String(fd.get("statementId")));
  const r = await facilityDispute(db, st.id, actor, String(fd.get("note") ?? ""));
  if (!r.ok) return { error: r.message };
  revalidatePath(`/facility/settlements/${st.id}`);
  return flash("運営に問い合わせました。確認のうえご連絡します。");
}
