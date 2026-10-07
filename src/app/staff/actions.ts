"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { generateSecret, verify } from "otplib";
import type { ActionState } from "@/components/action-form";
import { getDb, schema } from "@/db";
import {
  changePassword,
  completeMfa,
  endSession,
  getCurrentStaff,
  getStaffSession,
  homeForRole,
  loginStaff,
  requestMeta,
  requestPasswordReset,
  staffActor,
} from "@/lib/auth";
import { audit } from "@/lib/audit";
import { passwordProblem } from "@/lib/crypto";
import { flash } from "@/lib/flash";

export async function staffLoginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "メールアドレスとパスワードを入力してください" };
  const r = await loginStaff(email, password);
  if (!r.ok) return { error: r.error };
  redirect(r.mfa ? "/staff/mfa" : homeForRole(r.role!));
}

async function checkCode(secret: string | null, code: string) {
  if (!secret || !/^\d{6}$/.test(code)) return false;
  const r = await verify({ secret, token: code, epochTolerance: 30 }).catch(() => null);
  return !!r?.valid;
}

export async function staffMfaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getStaffSession();
  if (!s) redirect("/staff/login");
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  if (!(await checkCode(s.user.totpSecret, code))) return { error: "確認コードが違います。認証アプリの最新の6桁を入力してください" };
  await completeMfa();
  redirect(homeForRole(s.user.role));
}

export async function startTotpSetupAction(): Promise<void> {
  const u = await getCurrentStaff();
  if (!u) redirect("/staff/login");
  if (u.totpEnabled) return;
  const db = await getDb();
  await db.update(schema.staffUsers).set({ totpSecret: generateSecret() }).where(eq(schema.staffUsers.id, u.id));
  redirect("/staff/2fa-setup");
}

export async function enableTotpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await getCurrentStaff();
  if (!u) redirect("/staff/login");
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  if (!(await checkCode(u.totpSecret, code))) return { error: "確認コードが違います。もう一度お試しください" };
  const db = await getDb();
  await db.update(schema.staffUsers).set({ totpEnabled: true }).where(eq(schema.staffUsers.id, u.id));
  await audit(staffActor(u, (await requestMeta()).ip), "staff.2fa_enable", "staff_user", u.id);
  redirect(`${homeForRole(u.role)}?ok=2fa`);
}

export async function disableTotpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await getCurrentStaff();
  if (!u) redirect("/staff/login");
  if (process.env.REQUIRE_ADMIN_2FA === "true" && ["admin", "operator", "viewer"].includes(u.role)) {
    return { error: "運営アカウントは2段階認証が必須です" };
  }
  const code = String(fd.get("code") ?? "").replace(/\s/g, "");
  if (!(await checkCode(u.totpSecret, code))) return { error: "確認コードが違います" };
  const db = await getDb();
  await db.update(schema.staffUsers).set({ totpEnabled: false, totpSecret: null }).where(eq(schema.staffUsers.id, u.id));
  await audit(staffActor(u, (await requestMeta()).ip), "staff.2fa_disable", "staff_user", u.id);
  return flash("2段階認証を解除しました");
}

export async function staffForgotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = String(fd.get("email") ?? "").trim();
  if (!email) return { error: "メールアドレスを入力してください" };
  await requestPasswordReset(email, "staff");
  return { ok: "ご登録があれば、再設定のメールを送りました（1時間有効）。" };
}

export async function staffPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const u = await getCurrentStaff();
  if (!u) redirect("/staff/login");
  const next = String(fd.get("password") ?? "");
  const problem = passwordProblem(next);
  if (problem) return { error: problem };
  if (next !== String(fd.get("confirm") ?? "")) return { error: "確認用のパスワードが一致しません" };
  const r = await changePassword("staff", u.id, String(fd.get("current") ?? ""), next);
  if (!r.ok) return { error: r.error };
  await audit(staffActor(u, (await requestMeta()).ip), "staff.password_change", "staff_user", u.id);
  return { ok: "パスワードを変更しました" };
}

export async function staffLogoutAction() {
  await endSession("staff");
  redirect("/staff/login");
}
