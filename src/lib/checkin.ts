/**
 * 入館（QR読取 → コース選択 → 確定）と取消。
 * 入館の成立とポイント消費は1つのトランザクションで同時に確定する。
 */
import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { schema, type DB, type Executor } from "@/db";
import { audit, type Actor } from "./audit";
import { balanceOf, contractOn, memberActiveOn, rolloverMember } from "./ledger";
import {
  computeSettlement,
  computeSurcharges,
  distanceMeters,
  resolvePrice,
  resolveTerm,
  splitPayment,
  type SurchargeRule,
} from "./pricing";
import { getSettings } from "./settings";
import { businessDate, jstClockMinutes, jstDate, periodOf, weekdayOf, type Ymd } from "./time";

type Member = typeof schema.members.$inferSelect;
type Facility = typeof schema.facilities.$inferSelect;
export type Checkin = typeof schema.checkins.$inferSelect;

export const FLAG_LABELS: Record<string, string> = {
  far: "施設から離れた場所での入館",
  shared_device: "同じ端末で別の会員が入館",
  quick_succession: "短時間に別の施設で入館",
  no_terms: "精算条件が未設定",
};

/* ───────── QR ───────── */

export type QrResult =
  | { ok: true; qr: typeof schema.facilityQrs.$inferSelect; facility: Facility }
  | { ok: false; message: string };

export async function resolveQr(ex: Executor, token: string, now: Date): Promise<QrResult> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(token)) return { ok: false, message: "このQRコードは湯札のものではありません" };
  const [row] = await ex
    .select({ qr: schema.facilityQrs, facility: schema.facilities })
    .from(schema.facilityQrs)
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.facilityQrs.facilityId))
    .where(eq(schema.facilityQrs.token, token));
  if (!row) return { ok: false, message: "このQRコードは登録されていません" };
  if (row.qr.revokedAt || (row.qr.expiresAt && row.qr.expiresAt < now)) {
    return { ok: false, message: "このQRコードは使えなくなりました。受付付近の新しいQRコードを読み取ってください" };
  }
  if (row.facility.status !== "active") return { ok: false, message: "この施設は現在ご利用いただけません" };
  return { ok: true, qr: row.qr, facility: row.facility };
}

/* ───────── 見積（コース一覧と当日の追加料金） ───────── */

export type CourseQuote = {
  id: string;
  name: string;
  includes: string;
  durationText: string;
  points: number;
  listPrice: number;
  pointsUsed: number;
  shortageYen: number;
};

export type Quote = {
  facility: Facility;
  businessDate: Ymd;
  clockMinutes: number;
  holidayName: string | null;
  specialDayLabel: string | null;
  blocked: { code: string; message: string } | null;
  existing: Checkin | null;
  balance: number;
  yenPerPoint: number;
  courses: CourseQuote[];
  surcharge: ReturnType<typeof computeSurcharges>;
};

export async function dayInfo(ex: Executor, facilityId: string, date: Ymd) {
  const [hol] = await ex.select().from(schema.holidays).where(eq(schema.holidays.date, date));
  const [sp] = await ex
    .select()
    .from(schema.specialDays)
    .where(and(eq(schema.specialDays.date, date), or(isNull(schema.specialDays.facilityId), eq(schema.specialDays.facilityId, facilityId))));
  const [closure] = await ex
    .select()
    .from(schema.facilityClosures)
    .where(and(eq(schema.facilityClosures.facilityId, facilityId), eq(schema.facilityClosures.date, date)));
  return { holidayName: hol?.name ?? null, specialDayLabel: sp?.label ?? null, closure: closure ?? null };
}

export async function loadRules(ex: Executor, facilityId: string): Promise<SurchargeRule[]> {
  return ex.select().from(schema.surchargeRules).where(eq(schema.surchargeRules.facilityId, facilityId));
}

export function closedReason(
  facility: Pick<Facility, "closedWeekdays" | "openOnHolidays">,
  date: Ymd,
  closure: { note: string } | null,
  holidayName: string | null,
): string | null {
  if (closure) return `本日は臨時休館日です${closure.note ? `（${closure.note}）` : ""}`;
  if (facility.closedWeekdays & (1 << weekdayOf(date)) && !(holidayName && facility.openOnHolidays)) return "本日は定休日です";
  return null;
}

export async function facilityInScope(ex: Executor, contract: { id: string; facilityScope: string }, facilityId: string) {
  if (contract.facilityScope === "all") return true;
  const [r] = await ex
    .select()
    .from(schema.contractFacilities)
    .where(and(eq(schema.contractFacilities.contractId, contract.id), eq(schema.contractFacilities.facilityId, facilityId)));
  return !!r;
}

export async function quoteCheckin(ex: Executor, member: Member, facility: Facility, now: Date): Promise<Quote> {
  const settings = await getSettings(ex);
  const bizDate = businessDate(now, facility.daySwitchMinutes);
  const clock = jstClockMinutes(now);
  const info = await dayInfo(ex, facility.id, bizDate);
  const balance = await balanceOf(ex, member.id);

  let blocked: Quote["blocked"] = null;
  const today = jstDate(now);
  if (!memberActiveOn(member, bizDate) && !memberActiveOn(member, today)) {
    blocked =
      member.startsOn > today
        ? { code: "not_started", message: `ご利用は${member.startsOn.replace(/-/g, "/")}からです` }
        : { code: "stopped", message: "この会員証は利用停止になっています" };
  }
  const contract = blocked ? null : await contractOn(ex, member.companyId, bizDate);
  if (!blocked && !contract) blocked = { code: "no_contract", message: "所属企業の契約期間外のため、現在ご利用いただけません" };
  if (!blocked && contract && !(await facilityInScope(ex, contract, facility.id))) {
    blocked = { code: "out_of_scope", message: "この施設はご契約の対象外です" };
  }
  if (!blocked && facility.status !== "active") blocked = { code: "suspended", message: "この施設は現在ご利用いただけません" };
  const closed = closedReason(facility, bizDate, info.closure, info.holidayName);
  if (!blocked && closed) blocked = { code: "closed", message: closed };

  const [existing] = await ex
    .select()
    .from(schema.checkins)
    .where(and(eq(schema.checkins.memberId, member.id), eq(schema.checkins.businessDate, bizDate), eq(schema.checkins.status, "active")));

  const courseRows = await ex
    .select()
    .from(schema.courses)
    .where(and(eq(schema.courses.facilityId, facility.id), eq(schema.courses.active, true)))
    .orderBy(schema.courses.sort, schema.courses.name);
  const prices = courseRows.length
    ? await ex.select().from(schema.coursePrices).where(inArray(schema.coursePrices.courseId, courseRows.map((c) => c.id)))
    : [];
  const courses: CourseQuote[] = [];
  for (const c of courseRows) {
    const p = resolvePrice(prices.filter((x) => x.courseId === c.id), bizDate);
    if (!p) continue;
    const split = splitPayment(balance, p.points, settings.yenPerPoint);
    courses.push({
      id: c.id,
      name: c.name,
      includes: c.includes,
      durationText: c.durationText,
      points: p.points,
      listPrice: p.listPrice,
      ...split,
    });
  }
  if (!blocked && courses.length === 0) blocked = { code: "no_course", message: "この施設で選べるコースがありません" };

  const surcharge = computeSurcharges(await loadRules(ex, facility.id), {
    businessDate: bizDate,
    clockMinutes: clock,
    holidayName: info.holidayName,
    specialDayLabel: info.specialDayLabel,
  });

  return {
    facility,
    businessDate: bizDate,
    clockMinutes: clock,
    holidayName: info.holidayName,
    specialDayLabel: info.specialDayLabel,
    blocked,
    existing: existing ?? null,
    balance,
    yenPerPoint: settings.yenPerPoint,
    courses,
    surcharge,
  };
}

/* ───────── 確定 ───────── */

export type CheckinInput = {
  memberId: string;
  qrToken: string;
  courseId: string;
  idempotencyKey: string;
  deviceId: string;
  ip: string;
  userAgent: string;
  lat: number | null;
  lng: number | null;
  /** 画面に表示した追加料金・店頭払い額。確定時に変わっていたら確認し直してもらう。 */
  expectedPayAtDesk?: number;
};

export type CheckinResult =
  | { ok: true; checkin: Checkin; replay: boolean }
  | { ok: false; code: string; message: string; checkinId?: string };

function isUniqueViolation(e: unknown): boolean {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const c = cur as { code?: string; cause?: unknown; message?: string };
    if (c.code === "23505") return true;
    if (typeof c.message === "string" && c.message.includes("duplicate key")) return true;
    cur = c.cause;
  }
  return false;
}

export async function performCheckin(db: DB, input: CheckinInput, now = new Date()): Promise<CheckinResult> {
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(input.idempotencyKey)) return { ok: false, code: "bad_request", message: "画面を開き直してください" };
  try {
    return await db.transaction(async (tx) => {
      // 同じ操作の再送（通信の再試行・二重タップ）は最初の結果を返す
      const [replay] = await tx.select().from(schema.checkins).where(eq(schema.checkins.idempotencyKey, input.idempotencyKey));
      if (replay) {
        if (replay.memberId !== input.memberId) return { ok: false, code: "bad_request", message: "画面を開き直してください" };
        return { ok: true, checkin: replay, replay: true };
      }

      const [member] = await tx.select().from(schema.members).where(eq(schema.members.id, input.memberId)).for("update");
      if (!member) return { ok: false, code: "no_member", message: "会員情報が見つかりません" };
      await rolloverMember(tx, member, now);

      const qr = await resolveQr(tx, input.qrToken, now);
      if (!qr.ok) return { ok: false, code: "qr", message: qr.message };
      const facility = qr.facility;
      const quote = await quoteCheckin(tx, member, facility, now);
      if (quote.existing) {
        return { ok: false, code: "already", message: "本日はすでに入館済みです（1日1回まで）", checkinId: quote.existing.id };
      }
      if (quote.blocked) return { ok: false, code: quote.blocked.code, message: quote.blocked.message };
      const course = quote.courses.find((c) => c.id === input.courseId);
      if (!course) return { ok: false, code: "no_course", message: "選んだコースは現在ご利用いただけません" };
      const payAtDesk = course.shortageYen + quote.surcharge.total;
      if (input.expectedPayAtDesk !== undefined && input.expectedPayAtDesk !== payAtDesk) {
        return { ok: false, code: "changed", message: "料金が更新されました。内容をご確認のうえ、もう一度お進みください" };
      }

      const settings = await getSettings(tx);
      const terms = await tx.select().from(schema.settlementTerms).where(eq(schema.settlementTerms.facilityId, facility.id));
      const term = resolveTerm(terms, course.id, quote.businessDate);
      const flags: string[] = [];
      if (!term) flags.push("no_terms");
      const settlementAmount = term
        ? computeSettlement({
            method: term.method,
            ratioBp: term.ratioBp,
            unitPrice: term.unitPrice,
            pointsUsed: course.pointsUsed,
            yenPerPoint: quote.yenPerPoint,
            listPrice: course.listPrice,
            shortageYen: course.shortageYen,
          })
        : 0;

      let distanceM: number | null = null;
      if (input.lat != null && input.lng != null && facility.lat != null && facility.lng != null) {
        distanceM = distanceMeters(input.lat, input.lng, facility.lat, facility.lng);
        if (distanceM > settings.geofenceMeters) flags.push("far");
      }
      if (input.deviceId) {
        const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const [shared] = await tx
          .select({ id: schema.checkins.id })
          .from(schema.checkins)
          .where(
            and(
              eq(schema.checkins.deviceId, input.deviceId),
              ne(schema.checkins.memberId, member.id),
              gte(schema.checkins.checkedInAt, since),
            ),
          )
          .limit(1);
        if (shared) flags.push("shared_device");
      }
      const [prev] = await tx
        .select()
        .from(schema.checkins)
        .where(and(eq(schema.checkins.memberId, member.id), eq(schema.checkins.status, "active")))
        .orderBy(desc(schema.checkins.checkedInAt))
        .limit(1);
      if (prev && prev.facilityId !== facility.id && now.getTime() - prev.checkedInAt.getTime() < 3 * 60 * 60 * 1000) {
        flags.push("quick_succession");
      }

      const [created] = await tx
        .insert(schema.checkins)
        .values({
          memberId: member.id,
          companyId: member.companyId,
          facilityId: facility.id,
          courseId: course.id,
          qrId: qr.qr.id,
          businessDate: quote.businessDate,
          period: periodOf(quote.businessDate),
          checkedInAt: now,
          courseName: course.name,
          pointsRequired: course.points,
          pointsUsed: course.pointsUsed,
          yenPerPoint: quote.yenPerPoint,
          shortageYen: course.shortageYen,
          surchargeYen: quote.surcharge.total,
          surchargeDetail: quote.surcharge.applied.map((a) => ({ label: a.label, amount: a.amount })),
          stayNotices: quote.surcharge.notices.map((n) => ({ label: n.label, amount: n.amount, from: n.from })),
          listPrice: course.listPrice,
          settlementMethod: term?.method ?? "none",
          settlementRatioBp: term?.ratioBp ?? 0,
          settlementAmount,
          idempotencyKey: input.idempotencyKey,
          deviceId: input.deviceId,
          ip: input.ip,
          userAgent: input.userAgent,
          lat: input.lat,
          lng: input.lng,
          distanceM,
          flags,
        })
        .returning();

      if (course.pointsUsed > 0) {
        await tx.insert(schema.pointEntries).values({
          memberId: member.id,
          kind: "use",
          amount: -course.pointsUsed,
          period: periodOf(jstDate(now)),
          checkinId: created.id,
          note: `${facility.name} ${course.name}`,
        });
      }
      await audit(
        { kind: "member", id: member.id, name: member.name, ip: input.ip },
        "checkin.create",
        "checkin",
        created.id,
        { facility: facility.name, course: course.name, pointsUsed: course.pointsUsed, payAtDesk, flags },
        tx,
      );
      return { ok: true, checkin: created, replay: false };
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      // 同時に2回確定された場合など。先に成立した入館を返す。
      const [byKey] = await db.select().from(schema.checkins).where(eq(schema.checkins.idempotencyKey, input.idempotencyKey));
      if (byKey && byKey.memberId === input.memberId) return { ok: true, checkin: byKey, replay: true };
      return { ok: false, code: "already", message: "本日はすでに入館済みです（1日1回まで）" };
    }
    throw e;
  }
}

/* ───────── 取消 ───────── */

export type CancelBy =
  | { kind: "member"; actor: Actor }
  | { kind: "facility"; actor: Actor; facilityIds: string[] }
  | { kind: "admin"; actor: Actor };

export async function cancelCheckin(
  db: DB,
  checkinId: string,
  by: CancelBy,
  reason: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; message: string }> {
  const why = reason.trim();
  if (!why) return { ok: false, message: "取消の理由を入力してください" };
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(schema.checkins).where(eq(schema.checkins.id, checkinId)).for("update");
    if (!c) return { ok: false as const, message: "入館記録が見つかりません" };
    if (c.status === "cancelled") return { ok: false as const, message: "この入館はすでに取り消されています" };
    const [facility] = await tx.select().from(schema.facilities).where(eq(schema.facilities.id, c.facilityId));

    if (by.kind === "member") {
      if (by.actor.id !== c.memberId) return { ok: false as const, message: "この入館は取り消せません" };
      const { selfCancelMinutes } = await getSettings(tx);
      if (now.getTime() - c.checkedInAt.getTime() > selfCancelMinutes * 60 * 1000) {
        return { ok: false as const, message: `ご自身での取消は入館から${selfCancelMinutes}分以内です。受付にお申し出ください` };
      }
    }
    if (by.kind === "facility") {
      if (!by.facilityIds.includes(c.facilityId)) return { ok: false as const, message: "この入館は取り消せません" };
      if (c.businessDate !== businessDate(now, facility.daySwitchMinutes)) {
        return { ok: false as const, message: "当日分のみ取り消せます。前日以前の分は運営へ取消申請してください" };
      }
    }

    await tx
      .update(schema.checkins)
      .set({ status: "cancelled", cancelledAt: now, cancelReason: why, cancelledByKind: by.kind, cancelledById: by.actor.kind === "system" ? null : by.actor.id })
      .where(eq(schema.checkins.id, c.id));

    if (c.pointsUsed > 0) {
      await tx.insert(schema.pointEntries).values({
        memberId: c.memberId,
        kind: "refund",
        amount: c.pointsUsed,
        period: periodOf(jstDate(now)),
        checkinId: c.id,
        note: `入館取消（${facility.name}）`,
        createdBy: by.actor.name,
      });
    }

    // 確定済みの月の入館なら、当月の精算にマイナスの調整行を入れる（確定帳票は書き換えない）
    const [st] = await tx
      .select()
      .from(schema.statements)
      .where(and(eq(schema.statements.facilityId, c.facilityId), eq(schema.statements.period, c.period)));
    if (st?.status === "closed" && c.settlementAmount !== 0) {
      await tx.insert(schema.settlementAdjustments).values({
        facilityId: c.facilityId,
        period: periodOf(jstDate(now)),
        checkinId: c.id,
        amount: -c.settlementAmount,
        reason: `${c.businessDate} の入館取消（${why}）`,
        createdBy: by.actor.name,
      });
    }
    await audit(by.actor, "checkin.cancel", "checkin", c.id, { reason: why, by: by.kind }, tx);
    await tx
      .update(schema.cancelRequests)
      .set({ status: "approved", resolvedBy: by.actor.name, resolvedAt: now, resolutionNote: "取消済み" })
      .where(and(eq(schema.cancelRequests.checkinId, c.id), eq(schema.cancelRequests.status, "open")));
    return { ok: true as const };
  });
}

/** 入館証の表示に必要な情報 */
export async function loadPass(ex: Executor, checkinId: string) {
  const [row] = await ex
    .select({ c: schema.checkins, facility: schema.facilities, member: schema.members, companyName: schema.companies.name })
    .from(schema.checkins)
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.checkins.facilityId))
    .innerJoin(schema.members, eq(schema.members.id, schema.checkins.memberId))
    .innerJoin(schema.companies, eq(schema.companies.id, schema.checkins.companyId))
    .where(eq(schema.checkins.id, checkinId));
  return row ?? null;
}

export async function todaysCheckin(ex: Executor, memberId: string, now: Date) {
  // 施設ごとに営業日の区切りが違うため、直近24時間の有効な入館から当日分を探す
  const since = new Date(now.getTime() - 30 * 60 * 60 * 1000);
  const rows = await ex
    .select({ c: schema.checkins, facility: schema.facilities })
    .from(schema.checkins)
    .innerJoin(schema.facilities, eq(schema.facilities.id, schema.checkins.facilityId))
    .where(and(eq(schema.checkins.memberId, memberId), eq(schema.checkins.status, "active"), gte(schema.checkins.checkedInAt, since)))
    .orderBy(desc(schema.checkins.checkedInAt));
  return rows.find((r) => r.c.businessDate === businessDate(now, r.facility.daySwitchMinutes)) ?? null;
}

