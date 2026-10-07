/**
 * 料金・追加料金・精算額の計算（純粋関数）。
 * DBに依存しないため単体テストで全パターンを確認する。
 */
import { weekdayOf, type Ymd } from "./time";

export type SurchargeRule = {
  id: string;
  label: string;
  amount: number;
  weekdays: number;
  onHoliday: boolean;
  onSpecialDay: boolean;
  timeFrom: number | null;
  timeTo: number | null;
  kind: "entry" | "stay";
  groupKey: string;
  priority: number;
  effectiveFrom: Ymd;
  effectiveTo: Ymd | null;
  active: boolean;
};

export type DayContext = {
  businessDate: Ymd;
  /** 入館時刻（日本時間の0時からの分） */
  clockMinutes: number;
  holidayName: string | null;
  specialDayLabel: string | null;
};

export type AppliedSurcharge = { ruleId: string; label: string; amount: number };
export type StayNotice = { ruleId: string; label: string; amount: number; from: number };

export function isEffective(r: { effectiveFrom: Ymd; effectiveTo: Ymd | null; active: boolean }, date: Ymd) {
  return r.active && r.effectiveFrom <= date && (!r.effectiveTo || date <= r.effectiveTo);
}

export function dayMatches(rule: SurchargeRule, ctx: DayContext): boolean {
  const wd = weekdayOf(ctx.businessDate);
  if (rule.weekdays & (1 << wd)) return true;
  if (rule.onHoliday && ctx.holidayName) return true;
  if (rule.onSpecialDay && ctx.specialDayLabel) return true;
  return false;
}

export function timeMatches(rule: Pick<SurchargeRule, "timeFrom" | "timeTo">, clockMinutes: number): boolean {
  const { timeFrom: from, timeTo: to } = rule;
  if (from == null || to == null) return true;
  if (from === to) return true;
  return from < to ? clockMinutes >= from && clockMinutes < to : clockMinutes >= from || clockMinutes < to;
}

/**
 * 入館時に加算する追加料金と、滞在時間による予告を求める。
 * 同じグループのルールは優先順位が最も高い1件だけ（同順位なら金額の大きい方）、
 * グループ名が空のルールは常に単独で加算する。
 */
export function computeSurcharges(rules: SurchargeRule[], ctx: DayContext) {
  const live = rules.filter((r) => isEffective(r, ctx.businessDate) && dayMatches(r, ctx));
  const entry = live.filter((r) => r.kind === "entry" && timeMatches(r, ctx.clockMinutes));
  const byGroup = new Map<string, SurchargeRule>();
  for (const r of entry) {
    const key = r.groupKey ? `g:${r.groupKey}` : `r:${r.id}`;
    const cur = byGroup.get(key);
    if (!cur || r.priority > cur.priority || (r.priority === cur.priority && r.amount > cur.amount)) byGroup.set(key, r);
  }
  const applied: AppliedSurcharge[] = [...byGroup.values()]
    .sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label))
    .map((r) => ({ ruleId: r.id, label: r.label, amount: r.amount }));
  const notices: StayNotice[] = live
    .filter((r) => r.kind === "stay" && r.timeFrom != null)
    .map((r) => ({ ruleId: r.id, label: r.label, amount: r.amount, from: r.timeFrom as number }));
  return { applied, total: applied.reduce((s, a) => s + a.amount, 0), notices };
}

export type PriceVersion = { effectiveFrom: Ymd; points: number; listPrice: number };

/** 適用開始日が date 以前で最も新しいもの */
export function latestEffective<T extends { effectiveFrom: Ymd }>(versions: T[], date: Ymd): T | null {
  let best: T | null = null;
  for (const v of versions) if (v.effectiveFrom <= date && (!best || v.effectiveFrom > best.effectiveFrom)) best = v;
  return best;
}

export function resolvePrice<T extends PriceVersion>(versions: T[], date: Ymd): T | null {
  return latestEffective(versions, date);
}

export type SettlementTerm = {
  courseId: string | null;
  method: "points_ratio" | "list_ratio" | "unit";
  ratioBp: number;
  unitPrice: number;
  effectiveFrom: Ymd;
};

/** コース個別の条件を優先し、なければ施設の既定値。いずれも入館日時点で有効な最新のもの。 */
export function resolveTerm<T extends SettlementTerm>(terms: T[], courseId: string, date: Ymd): T | null {
  return (
    latestEffective(terms.filter((t) => t.courseId === courseId), date) ??
    latestEffective(terms.filter((t) => t.courseId === null), date)
  );
}

/** 残高が足りなければ残高を全て使い、不足分を円換算して店頭払いにする */
export function splitPayment(balance: number, pointsRequired: number, yenPerPoint: number) {
  const pointsUsed = Math.max(0, Math.min(balance, pointsRequired));
  const shortageYen = (pointsRequired - pointsUsed) * yenPerPoint;
  return { pointsUsed, shortageYen };
}

/**
 * 施設への精算額（1円未満切り捨て）。店頭で受け取った不足分・追加料金は施設の売上なので含めない。
 * - points_ratio: 使用ポイント × 換算率 × 精算比率
 * - list_ratio:   施設定価 × 精算比率 − 店頭収受の不足分
 * - unit:         1入館あたりの定額 − 店頭収受の不足分
 */
export function computeSettlement(input: {
  method: SettlementTerm["method"];
  ratioBp: number;
  unitPrice: number;
  pointsUsed: number;
  yenPerPoint: number;
  listPrice: number;
  shortageYen: number;
}): number {
  switch (input.method) {
    case "points_ratio":
      return Math.floor((input.pointsUsed * input.yenPerPoint * input.ratioBp) / 10000);
    case "list_ratio":
      return Math.max(0, Math.floor((input.listPrice * input.ratioBp) / 10000) - input.shortageYen);
    case "unit":
      return Math.max(0, input.unitPrice - input.shortageYen);
  }
}

export const METHOD_LABEL: Record<SettlementTerm["method"], string> = {
  points_ratio: "使用ポイント × 換算率 × 比率",
  list_ratio: "施設定価 × 比率 − 店頭収受額",
  unit: "1入館あたり定額 − 店頭収受額",
};

export function weekdayMaskLabel(mask: number): string {
  if (mask === 127) return "毎日";
  if (mask === 0) return "";
  if (mask === 0b1000001) return "土日";
  if (mask === 0b0111110) return "平日";
  return ["日", "月", "火", "水", "木", "金", "土"].filter((_, i) => mask & (1 << i)).join("・");
}

/** 2点間の距離（メートル） */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
