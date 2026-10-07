import crypto from "node:crypto";
import { getDb } from "@/db";
import { json } from "@/lib/http";
import { runDaily } from "@/lib/monthly";

/** 外部スケジューラ用。Authorization: Bearer <CRON_SECRET> */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const ok =
    !!secret &&
    secret.length >= 8 &&
    given.length === secret.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return json({ ok: false }, 401);
  const r = await runDaily(await getDb());
  return json({ ok: true, ...r });
}
