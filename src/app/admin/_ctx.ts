import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/components/action-form";
import { getDb } from "@/db";
import { requestMeta, requireStaff, staffActor, type CurrentStaff, type StaffRole } from "@/lib/auth";
import type { Actor } from "@/lib/audit";

export type AdminCtx = { u: CurrentStaff; actor: Actor; db: Awaited<ReturnType<typeof getDb>> };

export const WRITE: StaffRole[] = ["admin", "operator"];
export const ADMIN_ONLY: StaffRole[] = ["admin"];
export const READ: StaffRole[] = ["admin", "operator", "viewer"];

export async function adminCtx(roles: StaffRole[] = WRITE): Promise<AdminCtx> {
  const u = await requireStaff(READ);
  if (!roles.includes(u.role)) throw new Error(u.role === "viewer" ? "閲覧専用のアカウントでは変更できません" : "この操作は運営管理者のみ行えます");
  return { u, actor: staffActor(u, (await requestMeta()).ip), db: await getDb() };
}

/** 運営画面のアクション共通処理。例外はメッセージとして画面に返す（リダイレクトはそのまま通す）。 */
export async function act(roles: StaffRole[], fn: (c: AdminCtx) => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn(await adminCtx(roles));
  } catch (e) {
    unstable_rethrow(e);
    console.error(e);
    return { error: e instanceof Error ? e.message : "処理できませんでした" };
  }
}

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const int = (fd: FormData, k: string, def = 0) => {
  const v = str(fd, k).replace(/[,，]/g, "");
  if (v === "") return def;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error("数値は整数で入力してください");
  return n;
};
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "1" || fd.get(k) === "true";
export const uuidOk = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
