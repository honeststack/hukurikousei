"use server";

import { flash } from "@/lib/flash";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import type { ActionState } from "@/components/action-form";
import { schema } from "@/db";
import { audit } from "@/lib/audit";
import { randomToken } from "@/lib/crypto";
import { decodeCsvBytes } from "@/lib/csv";
import { parseHolidayCsv } from "@/lib/holidays";
import { getSettings } from "@/lib/settings";
import { isValidYmd, parseMinutes } from "@/lib/time";
import { act, bool, int, str, uuidOk, WRITE } from "./_ctx";

const back = (id: string) => revalidatePath(`/admin/facilities/${id}`);

function minutes(fd: FormData, k: string): number | null {
  const v = parseMinutes(str(fd, k));
  if (Number.isNaN(v)) throw new Error("時刻は 1:00 や 23:30 の形で入力してください");
  return v;
}

function weekdayMask(fd: FormData): number {
  return fd
    .getAll("weekdays")
    .map(Number)
    .filter((n) => n >= 0 && n <= 6)
    .reduce((m, d) => m | (1 << d), 0);
}

/* ───────── 施設 ───────── */

export async function saveFacilityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const id = str(fd, "id");
    const lat = str(fd, "lat");
    const lng = str(fd, "lng");
    const sw = minutes(fd, "daySwitch");
    const v = {
      operatorId: str(fd, "operatorId"),
      name: str(fd, "name"),
      nameKana: str(fd, "nameKana"),
      area: str(fd, "area"),
      address: str(fd, "address"),
      phone: str(fd, "phone"),
      lat: lat ? Number(lat) : null,
      lng: lng ? Number(lng) : null,
      hoursText: str(fd, "hoursText"),
      daySwitchMinutes: sw ?? 300,
      closedWeekdays: weekdayMask(fd),
      openOnHolidays: bool(fd, "openOnHolidays"),
      description: str(fd, "description"),
      notes: str(fd, "notes"),
      status: (str(fd, "status") === "suspended" ? "suspended" : "active") as "active" | "suspended",
    };
    if (!v.name) return { error: "施設名を入力してください" };
    if (!uuidOk(v.operatorId)) return { error: "運営会社を選んでください" };
    if ((v.lat != null && !Number.isFinite(v.lat)) || (v.lng != null && !Number.isFinite(v.lng))) return { error: "緯度・経度は数値で入力してください" };
    if (v.daySwitchMinutes > 12 * 60) return { error: "営業日の切替時刻は 0:00〜12:00 の間で設定してください" };
    if (id) {
      await db.update(schema.facilities).set(v).where(eq(schema.facilities.id, id));
      await audit(actor, "facility.update", "facility", id, v, db);
      revalidatePath(`/admin/facilities/${id}`);
      return { ok: "保存しました" };
    }
    const [f] = await db.insert(schema.facilities).values(v).returning();
    await db.insert(schema.facilityQrs).values({ facilityId: f.id, token: randomToken(12), label: "受付" });
    await audit(actor, "facility.create", "facility", f.id, v, db);
    redirect(`/admin/facilities/${f.id}?tab=courses&ok=created`);
  });
}

export async function saveCourseAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const facilityId = str(fd, "facilityId");
    const id = str(fd, "courseId");
    const v = {
      name: str(fd, "name"),
      includes: str(fd, "includes"),
      durationText: str(fd, "durationText"),
      sort: int(fd, "sort"),
      active: bool(fd, "active"),
    };
    if (!v.name) return { error: "コース名を入力してください" };
    if (id) {
      await db.update(schema.courses).set(v).where(and(eq(schema.courses.id, id), eq(schema.courses.facilityId, facilityId)));
      await audit(actor, "course.update", "course", id, v, db);
      back(facilityId);
      return { ok: "コースを保存しました" };
    }
    const effectiveFrom = str(fd, "effectiveFrom");
    const points = int(fd, "points", -1);
    const listPrice = int(fd, "listPrice", -1);
    if (!isValidYmd(effectiveFrom) || points < 0 || listPrice < 0) return { error: "必要ポイント・施設価格・適用開始日を入力してください" };
    await db.transaction(async (tx) => {
      const [c] = await tx.insert(schema.courses).values({ ...v, facilityId }).returning();
      await tx.insert(schema.coursePrices).values({ courseId: c.id, effectiveFrom, points, listPrice });
      await audit(actor, "course.create", "course", c.id, { ...v, points, listPrice, effectiveFrom }, tx);
    });
    back(facilityId);
    return { ok: `コース「${v.name}」を追加しました` };
  });
}

export async function addPriceAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const courseId = str(fd, "courseId");
    const effectiveFrom = str(fd, "effectiveFrom");
    const points = int(fd, "points", -1);
    const listPrice = int(fd, "listPrice", -1);
    if (!isValidYmd(effectiveFrom) || points < 0 || listPrice < 0) return { error: "必要ポイント・施設価格・適用開始日を入力してください" };
    const [c] = await db.select().from(schema.courses).where(eq(schema.courses.id, courseId));
    if (!c) return { error: "コースが見つかりません" };
    await db
      .insert(schema.coursePrices)
      .values({ courseId, effectiveFrom, points, listPrice })
      .onConflictDoUpdate({ target: [schema.coursePrices.courseId, schema.coursePrices.effectiveFrom], set: { points, listPrice } });
    await audit(actor, "course.price", "course", courseId, { effectiveFrom, points, listPrice }, db);
    back(c.facilityId);
    return { ok: `${effectiveFrom.replace(/-/g, "/")}からの料金を登録しました。過去の入館の精算額は変わりません。` };
  });
}

export async function saveSurchargeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const facilityId = str(fd, "facilityId");
    const id = str(fd, "ruleId");
    const v = {
      label: str(fd, "label"),
      amount: int(fd, "amount"),
      weekdays: weekdayMask(fd),
      onHoliday: bool(fd, "onHoliday"),
      onSpecialDay: bool(fd, "onSpecialDay"),
      timeFrom: minutes(fd, "timeFrom"),
      timeTo: minutes(fd, "timeTo"),
      kind: (str(fd, "kind") === "stay" ? "stay" : "entry") as "stay" | "entry",
      groupKey: str(fd, "groupKey"),
      priority: int(fd, "priority"),
      effectiveFrom: str(fd, "effectiveFrom"),
      effectiveTo: str(fd, "effectiveTo") || null,
      active: bool(fd, "active"),
    };
    if (!v.label) return { error: "表示名を入力してください（例：土日祝料金）" };
    if (v.amount <= 0) return { error: "金額を入力してください" };
    if (!v.weekdays && !v.onHoliday && !v.onSpecialDay) return { error: "対象の曜日・祝日・特別料金日のいずれかを選んでください" };
    if ((v.timeFrom == null) !== (v.timeTo == null)) return { error: "時間帯は開始と終了の両方を入力してください" };
    if (v.kind === "stay" && v.timeFrom == null) return { error: "「滞在」の追加料金は時間帯の指定が必要です" };
    if (!isValidYmd(v.effectiveFrom) || (v.effectiveTo && !isValidYmd(v.effectiveTo))) return { error: "適用期間を正しく入力してください" };
    if (id) {
      await db.update(schema.surchargeRules).set(v).where(and(eq(schema.surchargeRules.id, id), eq(schema.surchargeRules.facilityId, facilityId)));
      await audit(actor, "surcharge.update", "facility", facilityId, { id, ...v }, db);
    } else {
      const [r] = await db.insert(schema.surchargeRules).values({ ...v, facilityId }).returning();
      await audit(actor, "surcharge.create", "facility", facilityId, { id: r.id, ...v }, db);
    }
    back(facilityId);
    return { ok: "追加料金を保存しました。下の「試算」で確かめてください。" };
  });
}

export async function addTermAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const facilityId = str(fd, "facilityId");
    const courseId = str(fd, "courseId") || null;
    const method = str(fd, "method") as "points_ratio" | "list_ratio" | "unit";
    if (!["points_ratio", "list_ratio", "unit"].includes(method)) return { error: "精算方式を選んでください" };
    const ratioPct = Number(str(fd, "ratio") || "100");
    if (!(ratioPct > 0 && ratioPct <= 100)) return { error: "比率は 0〜100（%）で入力してください" };
    const v = {
      facilityId,
      courseId: courseId && uuidOk(courseId) ? courseId : null,
      method,
      ratioBp: Math.round(ratioPct * 100),
      unitPrice: int(fd, "unitPrice"),
      effectiveFrom: str(fd, "effectiveFrom"),
    };
    if (!isValidYmd(v.effectiveFrom)) return { error: "適用開始日を入力してください" };
    if (method === "unit" && v.unitPrice <= 0) return { error: "1入館あたりの金額を入力してください" };
    await db.insert(schema.settlementTerms).values(v);
    await audit(actor, "settlement_term.create", "facility", facilityId, v, db);
    back(facilityId);
    return { ok: `${v.effectiveFrom.replace(/-/g, "/")}以降の入館に適用する精算条件を登録しました` };
  });
}

export async function qrOpAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const facilityId = str(fd, "facilityId");
    const op = str(fd, "op");
    if (op === "issue") {
      const label = str(fd, "label") || "受付";
      const [q] = await db.insert(schema.facilityQrs).values({ facilityId, token: randomToken(12), label }).returning();
      await audit(actor, "qr.issue", "facility", facilityId, { qrId: q.id, label }, db);
      back(facilityId);
      return flash(`QRコード（${label}）を発行しました。掲示物を印刷して貼ってください。`);
    }
    const qrId = str(fd, "qrId");
    const [q] = await db.select().from(schema.facilityQrs).where(and(eq(schema.facilityQrs.id, qrId), eq(schema.facilityQrs.facilityId, facilityId)));
    if (!q) return { error: "QRコードが見つかりません" };
    if (op === "rotate") {
      const { qrGraceDays } = await getSettings(db);
      const expiresAt = new Date(Date.now() + qrGraceDays * 24 * 60 * 60 * 1000);
      await db.transaction(async (tx) => {
        await tx.update(schema.facilityQrs).set({ expiresAt }).where(eq(schema.facilityQrs.id, q.id));
        await tx.insert(schema.facilityQrs).values({ facilityId, token: randomToken(12), label: q.label });
      });
      await audit(actor, "qr.rotate", "facility", facilityId, { qrId: q.id, graceDays: qrGraceDays }, db);
      back(facilityId);
      return flash(`新しいQRコードを発行しました。掲示物を印刷して貼り替えてください。古いQRは${qrGraceDays}日後に使えなくなります。`);
    }
    if (op === "revoke") {
      await db.update(schema.facilityQrs).set({ revokedAt: new Date() }).where(eq(schema.facilityQrs.id, q.id));
      await audit(actor, "qr.revoke", "facility", facilityId, { qrId: q.id }, db);
      back(facilityId);
      return flash("QRコードをすぐに無効にしました");
    }
    return { error: "不明な操作です" };
  });
}

export async function closureAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const facilityId = str(fd, "facilityId");
    const op = str(fd, "op");
    if (op === "delete") {
      await db.delete(schema.facilityClosures).where(and(eq(schema.facilityClosures.id, str(fd, "id")), eq(schema.facilityClosures.facilityId, facilityId)));
      await audit(actor, "closure.delete", "facility", facilityId, { id: str(fd, "id") }, db);
    } else {
      const date = str(fd, "date");
      if (!isValidYmd(date)) return { error: "日付を入力してください" };
      await db
        .insert(schema.facilityClosures)
        .values({ facilityId, date, note: str(fd, "note") })
        .onConflictDoUpdate({ target: [schema.facilityClosures.facilityId, schema.facilityClosures.date], set: { note: str(fd, "note") } });
      await audit(actor, "closure.add", "facility", facilityId, { date }, db);
    }
    back(facilityId);
    return flash("休館日を更新しました");
  });
}

export async function specialDayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const facilityId = str(fd, "facilityId") || null;
    const op = str(fd, "op");
    if (op === "delete") {
      const id = str(fd, "id");
      await db.delete(schema.specialDays).where(eq(schema.specialDays.id, id));
      await audit(actor, "special_day.delete", "special_day", id, undefined, db);
    } else {
      const from = str(fd, "from");
      const to = str(fd, "to") || from;
      const label = str(fd, "label") || "特別料金日";
      if (!isValidYmd(from) || !isValidYmd(to) || to < from) return { error: "期間を正しく入力してください" };
      const days: string[] = [];
      for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
        days.push(d.toISOString().slice(0, 10));
        if (days.length > 60) return { error: "一度に登録できるのは60日までです" };
      }
      const existing = await db
        .select()
        .from(schema.specialDays)
        .where(facilityId ? eq(schema.specialDays.facilityId, facilityId) : isNull(schema.specialDays.facilityId));
      const fresh = days.filter((d) => !existing.some((e) => e.date === d));
      if (fresh.length) await db.insert(schema.specialDays).values(fresh.map((date) => ({ facilityId, date, label })));
      await audit(actor, "special_day.add", "special_day", facilityId ?? "all", { from, to, label }, db);
    }
    revalidatePath(facilityId ? `/admin/facilities/${facilityId}` : "/admin/calendar");
    return flash("特別料金日を更新しました");
  });
}

export async function holidayAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return act(WRITE, async ({ actor, db }) => {
    const op = str(fd, "op");
    if (op === "import") {
      const file = fd.get("file");
      if (!(file instanceof File) || !file.size) return { error: "CSVファイルを選んでください" };
      const rows = parseHolidayCsv(decodeCsvBytes(await file.arrayBuffer()));
      if (!rows.length) return { error: "祝日を読み取れませんでした。内閣府の「国民の祝日」CSVを選んでください" };
      for (const r of rows) {
        await db.insert(schema.holidays).values(r).onConflictDoUpdate({ target: schema.holidays.date, set: { name: r.name } });
      }
      await audit(actor, "holiday.import", "holiday", "", { count: rows.length }, db);
      revalidatePath("/admin/calendar");
      return { ok: `${rows.length}件の祝日を取り込みました` };
    }
    if (op === "add") {
      const date = str(fd, "date");
      if (!isValidYmd(date)) return { error: "日付を入力してください" };
      await db
        .insert(schema.holidays)
        .values({ date, name: str(fd, "name") || "休日" })
        .onConflictDoUpdate({ target: schema.holidays.date, set: { name: str(fd, "name") || "休日" } });
      await audit(actor, "holiday.add", "holiday", date, undefined, db);
    }
    if (op === "delete") {
      await db.delete(schema.holidays).where(eq(schema.holidays.date, str(fd, "date")));
      await audit(actor, "holiday.delete", "holiday", str(fd, "date"), undefined, db);
    }
    revalidatePath("/admin/calendar");
    return flash("祝日を更新しました");
  });
}
