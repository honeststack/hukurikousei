"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull, or, gt } from "drizzle-orm";
import type { ActionState } from "@/components/action-form";
import { memberFormData } from "@/components/member-fields";
import { getDb, schema } from "@/db";
import { requestMeta, requireStaff, staffActor } from "@/lib/auth";
import { createImportPreview } from "@/lib/import-actions";
import { afterMemberSaved, applyImportAndInvite, inviteMembers } from "@/lib/member-ops";
import { createMember, updateMember } from "@/lib/members";
import { memberInCompany } from "@/lib/scope";
import { jstDate } from "@/lib/time";

async function ctx() {
  const u = await requireStaff(["company"]);
  if (!u.companyId) throw new Error("企業が設定されていません");
  return { u, companyId: u.companyId, actor: staffActor(u, (await requestMeta()).ip), db: await getDb() };
}

export async function addMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { companyId, actor, db } = await ctx();
  const r = await createMember(db, companyId, memberFormData(fd), actor);
  if (!r.ok) return { error: r.message };
  await afterMemberSaved(r.member.id);
  const invited = fd.get("sendInvite") ? await inviteMembers([r.member.id], actor) : 0;
  revalidatePath("/company/members");
  return { ok: `${r.member.name} さんを登録しました${invited ? "。会員証のご案内メールを送りました" : ""}` };
}

export async function updateMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { companyId, actor, db } = await ctx();
  const id = String(fd.get("memberId"));
  if (!(await memberInCompany(id, companyId))) return { error: "会員が見つかりません" };
  const r = await updateMember(db, id, memberFormData(fd), actor);
  if (!r.ok) return { error: r.message };
  await afterMemberSaved(id);
  revalidatePath(`/company/members/${id}`);
  return { ok: "保存しました" };
}

export async function inviteMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { companyId, actor } = await ctx();
  const id = String(fd.get("memberId"));
  if (!(await memberInCompany(id, companyId))) return { error: "会員が見つかりません" };
  const n = await inviteMembers([id], actor);
  return n ? { ok: "会員証のご案内メールを送りました（14日間有効）" } : { error: "設定済みまたは利用停止中の会員には送れません" };
}

export async function inviteAllPendingAction(_: ActionState, _fd: FormData): Promise<ActionState> {
  const { companyId, actor, db } = await ctx();
  const today = jstDate(new Date());
  const rows = await db
    .select({ id: schema.members.id })
    .from(schema.members)
    .where(
      and(
        eq(schema.members.companyId, companyId),
        isNull(schema.members.passwordHash),
        or(isNull(schema.members.stopsOn), gt(schema.members.stopsOn, today)),
      ),
    );
  const n = await inviteMembers(
    rows.map((r) => r.id),
    actor,
  );
  revalidatePath("/company");
  return { ok: `${n}名にご案内メールを再送しました` };
}

export async function uploadImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { companyId, actor } = await ctx();
  const r = await createImportPreview(fd, companyId, actor);
  if (!r.ok) return { error: r.message };
  redirect(`/company/import?id=${r.id}`);
}

export async function applyImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { companyId, actor } = await ctx();
  const r = await applyImportAndInvite(String(fd.get("importId")), companyId, actor, !!fd.get("sendInvites"));
  if (!r.ok) return { error: r.message };
  redirect(`/company/members?ok=${encodeURIComponent(`CSVを反映しました（新規 ${r.created}名・案内メール ${r.invited}通）`)}`);
}

export async function discardImportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { companyId, db } = await ctx();
  await db
    .update(schema.memberImports)
    .set({ status: "discarded" })
    .where(and(eq(schema.memberImports.id, String(fd.get("importId"))), eq(schema.memberImports.companyId, companyId)));
  redirect("/company/import");
}
