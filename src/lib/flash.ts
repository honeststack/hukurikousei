import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

/**
 * 操作した画面に戻り、画面上部に結果を表示する。
 * 行ごとの操作（取消・再発行など）は、処理後にその行のフォームが消えるため、
 * フォーム内ではなくページ上部にメッセージを出す。
 */
export async function flash(message: string, kind: "ok" | "error" = "ok"): Promise<never> {
  const ref = (await headers()).get("referer");
  let target = "/";
  try {
    // 他サイトへ飛ばないよう、パスとクエリだけを使う
    const u = new URL(ref ?? "/", "http://localhost");
    u.searchParams.set("flash", message);
    u.searchParams.set("fk", kind);
    target = u.pathname + u.search;
  } catch {
    target = "/";
  }
  redirect(target);
}
