/**
 * 日本時間（UTC+9、夏時間なし）の日付計算。
 * 判定は全てサーバー時刻で行い、端末の時計は表示にしか使わない。
 */
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Ymd = string; // "2026-10-07"
export type Period = string; // "2026-10"

export const WEEKDAYS_JA = ["日", "月", "火", "水", "木", "金", "土"] as const;

export function jstParts(at: Date) {
  const t = new Date(at.getTime() + JST_OFFSET_MS);
  return {
    year: t.getUTCFullYear(),
    month: t.getUTCMonth() + 1,
    day: t.getUTCDate(),
    hour: t.getUTCHours(),
    minute: t.getUTCMinutes(),
    second: t.getUTCSeconds(),
    weekday: t.getUTCDay(),
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

export function jstDate(at: Date): Ymd {
  const p = jstParts(at);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** 0時からの経過分（日本時間） */
export function jstClockMinutes(at: Date): number {
  const p = jstParts(at);
  return p.hour * 60 + p.minute;
}

/** 営業日。切替時刻（例: 5:00）より前の入館は前日の営業日として扱う。 */
export function businessDate(at: Date, daySwitchMinutes: number): Ymd {
  return jstDate(new Date(at.getTime() - daySwitchMinutes * 60 * 1000));
}

export function periodOf(date: Ymd): Period {
  return date.slice(0, 7);
}

export function currentPeriod(now = new Date()): Period {
  return periodOf(jstDate(now));
}

export function weekdayOf(date: Ymd): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: Ymd, days: number): Ymd {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function firstDayOf(period: Period): Ymd {
  return `${period}-01`;
}

export function lastDayOf(period: Period): Ymd {
  const [y, m] = period.split("-").map(Number);
  const t = new Date(Date.UTC(y, m, 0));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addMonths(period: Period, n: number): Period {
  const [y, m] = period.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
}

/** 日本時間の日付＋時刻から Date を作る */
export function jstToDate(date: Ymd, minutes = 0): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - JST_OFFSET_MS + minutes * 60 * 1000);
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isValidPeriod(s: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

/* ───── 表示用 ───── */

export function fmtDate(date: Ymd | null | undefined): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  return `${y}年${m}月${d}日（${WEEKDAYS_JA[weekdayOf(date)]}）`;
}

export function fmtShortDate(date: Ymd | null | undefined): string {
  if (!date) return "—";
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}（${WEEKDAYS_JA[weekdayOf(date)]}）`;
}

export function fmtPeriod(period: Period): string {
  const [y, m] = period.split("-").map(Number);
  return `${y}年${m}月`;
}

export function fmtTime(at: Date | null | undefined): string {
  if (!at) return "—";
  const p = jstParts(at);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

export function fmtDateTime(at: Date | null | undefined): string {
  if (!at) return "—";
  const p = jstParts(at);
  return `${p.year}/${pad(p.month)}/${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** 分 → "1:00"。24時以降も "25:00" とせず時計表記に丸める */
export function fmtMinutes(min: number | null | undefined): string {
  if (min == null) return "";
  const m = ((min % 1440) + 1440) % 1440;
  return `${Math.floor(m / 60)}:${pad(m % 60)}`;
}

export function parseMinutes(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return NaN;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return NaN;
  return h * 60 + mi;
}

export function yen(n: number): string {
  return `${n < 0 ? "−" : ""}¥${Math.abs(n).toLocaleString("ja-JP")}`;
}

export function num(n: number): string {
  return n.toLocaleString("ja-JP");
}
