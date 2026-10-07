import { z } from "zod";
import { getDb } from "@/db";
import { getCurrentMember, readDeviceId, requestMeta } from "@/lib/auth";
import { performCheckin } from "@/lib/checkin";
import { isSameOrigin, json } from "@/lib/http";

const body = z.object({
  qrToken: z.string().min(8).max(64),
  courseId: z.string().uuid(),
  idempotencyKey: z.string().min(16).max(80),
  expectedPayAtDesk: z.number().int().min(0).optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return json({ ok: false, code: "forbidden", message: "画面を開き直してください" }, 403);
  const member = await getCurrentMember();
  if (!member) return json({ ok: false, code: "login", message: "ログインし直してください" }, 401);
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, code: "bad_request", message: "画面を開き直してください" }, 400);
  const v = parsed.data;
  const meta = await requestMeta();
  const db = await getDb();
  const r = await performCheckin(db, {
    memberId: member.id,
    qrToken: v.qrToken,
    courseId: v.courseId,
    idempotencyKey: v.idempotencyKey.replace(/[^A-Za-z0-9_-]/g, ""),
    deviceId: await readDeviceId(),
    ip: meta.ip,
    userAgent: meta.userAgent,
    lat: v.lat ?? null,
    lng: v.lng ?? null,
    expectedPayAtDesk: v.expectedPayAtDesk,
  });
  if (r.ok) return json({ ok: true, checkinId: r.checkin.id });
  return json({ ok: false, code: r.code, message: r.message, checkinId: r.checkinId }, r.code === "already" ? 409 : 422);
}
