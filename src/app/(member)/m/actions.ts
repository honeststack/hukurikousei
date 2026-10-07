"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { getDb } from "@/db";
import { changePassword, memberActor, requestMeta, requireMember } from "@/lib/auth";
import { cancelCheckin } from "@/lib/checkin";
import { passwordProblem } from "@/lib/crypto";

export async function selfCancelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const member = await requireMember();
  const id = String(fd.get("checkinId") ?? "");
  const reason = String(fd.get("reason") ?? "").trim() || "会員による取消（選び間違い）";
  const db = await getDb();
  const meta = await requestMeta();
  const r = await cancelCheckin(db, id, { kind: "member", actor: memberActor(member, meta.ip) }, reason);
  if (!r.ok) return { error: r.message };
  revalidatePath("/m");
  redirect("/m?cancelled=1");
}

export async function memberPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const member = await requireMember();
  const current = String(fd.get("current") ?? "");
  const next = String(fd.get("password") ?? "");
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (next !== String(fd.get("confirm") ?? "")) return { error: "確認用のパスワードが一致しません" };
  const r = await changePassword("member", member.id, current, next);
  if (!r.ok) return { error: r.error };
  return { ok: "パスワードを変更しました" };
}
