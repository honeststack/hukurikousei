"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { endSession, loginMember, requestPasswordReset, setPasswordWithToken } from "@/lib/auth";
import { passwordProblem } from "@/lib/crypto";

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/m";
}

export async function memberLoginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "メールアドレスとパスワードを入力してください" };
  const r = await loginMember(email, password);
  if (!r.ok) return { error: r.error };
  redirect(safeNext(fd.get("next")));
}

export async function memberForgotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim();
  if (!email) return { error: "メールアドレスを入力してください" };
  await requestPasswordReset(email, "member");
  return { ok: "ご登録があれば、パスワード再設定のメールを送りました。メールのリンクは1時間有効です。" };
}

export async function setPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = String(fd.get("token") ?? "");
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  const problem = passwordProblem(password);
  if (problem) return { error: problem };
  if (password !== confirm) return { error: "確認用のパスワードが一致しません" };
  const r = await setPasswordWithToken(token, password);
  if (!r.ok) return { error: r.error };
  if (r.subjectKind === "staff") redirect("/staff");
  redirect(fd.get("first") ? "/m/guide?first=1" : "/m");
}

export async function memberLogoutAction() {
  await endSession("member");
  redirect("/login");
}
