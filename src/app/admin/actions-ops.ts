"use server";

import { flash } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import type { ActionState } from "@/components/action-form";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { cancelCheckin } from "@/lib/checkin";
import { runDaily } from "@/lib/monthly";
import { saveSettings } from "@/lib/settings";
import { closeStatement, prepareStatements, reopenStatement, startReview } from "@/lib/statements";
import { currentPeriod, isValidPeriod, jstToDate, periodOf } from "@/lib/time";
import { act, ADMIN_ONLY, int, str, uuidOk, WRITE } from "./_ctx";

/* ───────── 入館 ───────── */

export async function adminCancelCheckinAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const id = str(fd, "checkinId");
    const r = await cancelCheckin(db, id, { kind: "admin", actor }, str(fd, "reason"));
    if (!r.ok) return { error: r.message };
    revalidatePath(`/admin/checkins/${id}`);
    return flash("入館を取り消しました。ポイントは会員に戻りました。確定済みの月の入館は、当月の精算に調整行が入ります。");
  });
}

export async function resolveFlagsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const ids = fd.getAll("checkinId").map(String).filter(uuidOk);
    if (!ids.length) return { error: "対象を選んでください" };
    const note = str(fd, "note");
    for (const id of ids) {
      await db
        .update(schema.checkins)
        .set({ flagsResolvedAt: new Date(), flagsResolvedBy: `${actor.name}${note ? `：${note}` : ""}` })
        .where(eq(schema.checkins.id, id));
      await audit(actor, "checkin.flags_resolve", "checkin", id, { note }, db);
    }
    revalidatePath("/admin/flags");
    return flash(`${ids.length}件を確認済みにしました`);
  });
}

/** 障害時の代理登録：施設が紙で控えた入館を、運営が後から登録する */
export async function proxyCheckinAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const memberId = str(fd, "memberId");
    const qrId = str(fd, "qrId");
    const courseId = str(fd, "courseId");
    const date = str(fd, "date");
    const time = str(fd, "time");
    const reason = str(fd, "reason");
    if (!reason) return { error: "代理登録の理由を入力してください" };
    const m = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!m) return { error: "時刻を入力してください" };
    const at = jstToDate(date, Number(m[1]) * 60 + Number(m[2]));
    if (Number.isNaN(at.getTime()) || at > new Date()) return { error: "日時を正しく入力してください（未来の日時は登録できません）" };
    if (periodOf(date) !== currentPeriod()) return { error: "代理登録できるのは今月の入館だけです" };
    const [qr] = await db.select().from(schema.facilityQrs).where(eq(schema.facilityQrs.id, qrId));
    if (!qr) return { error: "施設を選んでください" };
    const { performCheckin } = await import("@/lib/checkin");
    const r = await performCheckin(
      db,
      {
        memberId,
        qrToken: qr.token,
        courseId,
        idempotencyKey: `proxy-${memberId}-${date}-${time.replace(":", "")}-x`,
        deviceId: "",
        ip: actor.ip ?? "",
        userAgent: `代理登録（${actor.name}）`,
        lat: null,
        lng: null,
      },
      at,
    );
    if (!r.ok) return { error: r.message };
    await audit(actor, "checkin.proxy", "checkin", r.checkin.id, { reason }, db);
    revalidatePath("/admin/checkins");
    return { ok: "入館を代理登録しました" };
  });
}

/* ───────── 申請 ───────── */

export async function resolveCancelRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const id = str(fd, "requestId");
    const decision = str(fd, "decision");
    const note = str(fd, "note");
    const [req] = await db.select().from(schema.cancelRequests).where(eq(schema.cancelRequests.id, id));
    if (!req || req.status !== "open") return { error: "未対応の申請ではありません" };
    if (decision === "approve") {
      const r = await cancelCheckin(db, req.checkinId, { kind: "admin", actor }, `施設からの申請：${req.reason}`);
      if (!r.ok) return { error: r.message };
      if (note) await db.update(schema.cancelRequests).set({ resolutionNote: note }).where(eq(schema.cancelRequests.id, id));
    } else {
      if (!note) return { error: "見送る理由を入力してください（施設に表示されます）" };
      await db
        .update(schema.cancelRequests)
        .set({ status: "rejected", resolvedBy: actor.name, resolvedAt: new Date(), resolutionNote: note })
        .where(eq(schema.cancelRequests.id, id));
      await audit(actor, "cancel_request.reject", "cancel_request", id, { note }, db);
    }
    revalidatePath("/admin/requests");
    return flash(decision === "approve" ? "入館を取り消しました（施設の申請を承認）" : "申請を見送りました");
  });
}

export async function resolveChangeRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const id = str(fd, "requestId");
    const status = str(fd, "decision") === "done" ? "done" : "rejected";
    const note = str(fd, "note");
    await db
      .update(schema.changeRequests)
      .set({ status, resolvedBy: actor.name, resolvedAt: new Date(), resolutionNote: note || null })
      .where(and(eq(schema.changeRequests.id, id), eq(schema.changeRequests.status, "open")));
    await audit(actor, `change_request.${status}`, "change_request", id, { note }, db);
    revalidatePath("/admin/requests");
    return flash(status === "done" ? "反映済みにしました" : "申請を見送りました");
  });
}

/* ───────── 精算 ───────── */

export async function prepareStatementsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const period = str(fd, "period");
    if (!isValidPeriod(period)) return { error: "対象月が正しくありません" };
    const list = await prepareStatements(db, period);
    await audit(actor, "statement.prepare", "statement", period, { count: list.length }, db);
    revalidatePath("/admin/settlements");
    return { ok: `${list.length}施設の明細を集計し直しました` };
  });
}

export async function statementOpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const op = str(fd, "op");
  return act(op === "close" ? ADMIN_ONLY : WRITE, async ({ actor, db }) => {
    const ids = fd.getAll("statementId").map(String).filter(uuidOk);
    if (!ids.length) return { error: "対象を選んでください" };
    const errors: string[] = [];
    for (const id of ids) {
      const r =
        op === "review" ? await startReview(db, id, actor) : op === "reopen" ? await reopenStatement(db, id, actor) : op === "close" ? await closeStatement(db, id, actor) : null;
      if (!r) return { error: "不明な操作です" };
      if (!r.ok) errors.push(r.message);
    }
    revalidatePath("/admin/settlements");
    const done = ids.length - errors.length;
    const verb = op === "review" ? "確認依頼" : op === "reopen" ? "締め前に戻" : "確定";
    if (!done) return { error: [...new Set(errors)].join("／") };
    const note = errors.length ? `（${errors.length}件は対象外：${[...new Set(errors)].join("／")}）` : "";
    return { ok: `${done}件を${verb}しました${note}` };
  });
}

/* ───────── 定期処理・お知らせ・設定 ───────── */

export async function runDailyAction(_: ActionState, _fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ db }) => {
    const r = await runDaily(db);
    revalidatePath("/admin/monthly");
    return { ok: `実行しました：会員 ${r.members}名（付与 ${r.granted}・失効 ${r.expired}・停止 ${r.revoked}）` };
  });
}

export async function noticeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const op = str(fd, "op");
    if (op === "expire") {
      const id = str(fd, "id");
      await db.update(schema.notices).set({ expiresAt: new Date() }).where(eq(schema.notices.id, id));
      await audit(actor, "notice.expire", "notice", id, undefined, db);
      revalidatePath("/admin/notices");
      return flash("掲載を終了しました");
    }
    const audience = (["all", "company", "facility"].includes(str(fd, "audience")) ? str(fd, "audience") : "all") as "all" | "company" | "facility";
    const v = {
      title: str(fd, "title"),
      body: str(fd, "body"),
      audience,
      companyId: audience === "company" ? str(fd, "companyId") : null,
      facilityId: audience === "facility" ? str(fd, "facilityId") : null,
      publishedAt: str(fd, "publishedAt") ? new Date(`${str(fd, "publishedAt")}:00+09:00`) : new Date(),
      expiresAt: str(fd, "expiresAt") ? new Date(`${str(fd, "expiresAt")}T23:59:59+09:00`) : null,
      createdBy: actor.name,
    };
    if (!v.title || !v.body) return { error: "件名と本文を入力してください" };
    if (audience === "company" && !uuidOk(v.companyId ?? "")) return { error: "企業を選んでください" };
    if (audience === "facility" && !uuidOk(v.facilityId ?? "")) return { error: "施設を選んでください" };
    if (Number.isNaN(v.publishedAt.getTime())) return { error: "掲載開始日時を正しく入力してください" };
    const [n] = await db.insert(schema.notices).values(v).returning();
    await audit(actor, "notice.create", "notice", n.id, { title: v.title, audience }, db);
    revalidatePath("/admin/notices");
    return { ok: "お知らせを登録しました" };
  });
}

export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(ADMIN_ONLY, async ({ actor, db }) => {
    const v = {
      yenPerPoint: int(fd, "yenPerPoint", 1),
      selfCancelMinutes: int(fd, "selfCancelMinutes", 3),
      geofenceMeters: int(fd, "geofenceMeters", 1000),
      maxMemberDevices: int(fd, "maxMemberDevices", 2),
      qrGraceDays: int(fd, "qrGraceDays", 14),
      supportName: str(fd, "supportName"),
      supportPhone: str(fd, "supportPhone"),
      supportEmail: str(fd, "supportEmail"),
      supportHours: str(fd, "supportHours"),
    };
    if (v.yenPerPoint < 1) return { error: "換算率は1以上にしてください" };
    if (v.selfCancelMinutes < 0 || v.selfCancelMinutes > 30) return { error: "会員の自己取消は0〜30分で設定してください" };
    if (v.maxMemberDevices < 1 || v.maxMemberDevices > 5) return { error: "同時ログイン端末数は1〜5で設定してください" };
    await saveSettings(v, db);
    await audit(actor, "settings.update", "settings", "", v, db);
    revalidatePath("/admin/settings");
    return { ok: "設定を保存しました。換算率の変更は、これからの入館にだけ適用されます。" };
  });
}
