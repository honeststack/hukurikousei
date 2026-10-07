import { describe, expect, it } from "vitest";
import {
  computeSettlement,
  computeSurcharges,
  resolvePrice,
  resolveTerm,
  splitPayment,
  timeMatches,
  type SurchargeRule,
} from "@/lib/pricing";
import { addMonths, businessDate, jstToDate, lastDayOf, weekdayOf } from "@/lib/time";
import { normalizeDate, toCsv, decodeCsvBytes } from "@/lib/csv";
import { dailyMark } from "@/lib/daily";

const base: Omit<SurchargeRule, "id" | "label" | "amount"> = {
  weekdays: 0,
  onHoliday: false,
  onSpecialDay: false,
  timeFrom: null,
  timeTo: null,
  kind: "entry",
  groupKey: "",
  priority: 0,
  effectiveFrom: "2020-01-01",
  effectiveTo: null,
  active: true,
};
const rule = (p: Partial<SurchargeRule> & { id: string; label: string; amount: number }): SurchargeRule => ({ ...base, ...p });

describe("営業日と日付", () => {
  it("切替時刻より前の入館は前日の営業日", () => {
    // 2026-10-10(土) 03:00 JST、切替5:00 → 10/9(金)
    expect(businessDate(jstToDate("2026-10-10", 180), 300)).toBe("2026-10-09");
    expect(businessDate(jstToDate("2026-10-10", 300), 300)).toBe("2026-10-10");
    expect(businessDate(jstToDate("2026-10-10", 0), 0)).toBe("2026-10-10");
  });
  it("曜日・月末・月の加算", () => {
    expect(weekdayOf("2026-10-07")).toBe(3);
    expect(lastDayOf("2028-02")).toBe("2028-02-29");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
  });
});

describe("追加料金", () => {
  const WEEKEND = 0b1000001;
  const rules = [
    rule({ id: "w", label: "土日祝料金", amount: 300, weekdays: WEEKEND, onHoliday: true, groupKey: "day", priority: 10 }),
    rule({ id: "s", label: "特別料金日", amount: 500, onSpecialDay: true, groupKey: "day", priority: 20 }),
    rule({ id: "n", label: "深夜料金", amount: 1500, weekdays: 127, timeFrom: 60, timeTo: 300, kind: "stay" }),
    rule({ id: "e", label: "夜間入館", amount: 200, weekdays: 127, timeFrom: 1260, timeTo: 240 }),
  ];
  const ctx = (date: string, clock: number, holiday: string | null = null, special: string | null = null) => ({
    businessDate: date,
    clockMinutes: clock,
    holidayName: holiday,
    specialDayLabel: special,
  });

  it("平日の昼は追加料金なし、深夜の予告だけ出る", () => {
    const r = computeSurcharges(rules, ctx("2026-10-07", 12 * 60));
    expect(r.total).toBe(0);
    expect(r.notices).toEqual([{ ruleId: "n", label: "深夜料金", amount: 1500, from: 60 }]);
  });
  it("土曜は土日祝料金", () => {
    expect(computeSurcharges(rules, ctx("2026-10-10", 12 * 60)).total).toBe(300);
  });
  it("平日の祝日も土日祝料金", () => {
    expect(computeSurcharges(rules, ctx("2026-10-12", 12 * 60, "スポーツの日")).total).toBe(300);
  });
  it("同じグループは優先順位の高い特別料金日だけ", () => {
    const r = computeSurcharges(rules, ctx("2026-12-29", 12 * 60, null, "年末年始"));
    expect(r.applied.map((a) => a.label)).toEqual(["特別料金日"]);
    expect(r.total).toBe(500);
  });
  it("別グループは加算し、日付をまたぐ時間帯も判定できる", () => {
    const r = computeSurcharges(rules, ctx("2026-10-10", 23 * 60));
    expect(r.total).toBe(500);
    expect(computeSurcharges(rules, ctx("2026-10-07", 3 * 60)).total).toBe(200);
    expect(computeSurcharges(rules, ctx("2026-10-07", 4 * 60)).total).toBe(0);
  });
  it("適用期間外・無効のルールは使わない", () => {
    const r = computeSurcharges(
      [
        rule({ id: "x", label: "旧料金", amount: 999, weekdays: 127, effectiveTo: "2026-09-30" }),
        rule({ id: "y", label: "停止中", amount: 999, weekdays: 127, active: false }),
      ],
      ctx("2026-10-07", 600),
    );
    expect(r.total).toBe(0);
  });
  it("時間帯の境界", () => {
    expect(timeMatches({ timeFrom: 60, timeTo: 300 }, 60)).toBe(true);
    expect(timeMatches({ timeFrom: 60, timeTo: 300 }, 300)).toBe(false);
    expect(timeMatches({ timeFrom: 1320, timeTo: 120 }, 0)).toBe(true);
  });
});

describe("料金の版と精算", () => {
  it("入館日時点で有効な最新の料金を使う", () => {
    const v = [
      { effectiveFrom: "2026-01-01", points: 1000, listPrice: 1100 },
      { effectiveFrom: "2026-10-01", points: 1200, listPrice: 1350 },
      { effectiveFrom: "2026-11-01", points: 1300, listPrice: 1400 },
    ];
    expect(resolvePrice(v, "2026-09-30")?.points).toBe(1000);
    expect(resolvePrice(v, "2026-10-07")?.points).toBe(1200);
    expect(resolvePrice(v, "2025-12-31")).toBeNull();
  });
  it("精算条件はコース個別を優先", () => {
    const t = [
      { courseId: null, method: "points_ratio" as const, ratioBp: 8000, unitPrice: 0, effectiveFrom: "2026-01-01" },
      { courseId: "c1", method: "unit" as const, ratioBp: 10000, unitPrice: 860, effectiveFrom: "2026-01-01" },
    ];
    expect(resolveTerm(t, "c1", "2026-10-07")?.method).toBe("unit");
    expect(resolveTerm(t, "c2", "2026-10-07")?.method).toBe("points_ratio");
  });
  it("残高不足は残高を全て使い、差額を店頭払い", () => {
    expect(splitPayment(5000, 1200, 1)).toEqual({ pointsUsed: 1200, shortageYen: 0 });
    expect(splitPayment(700, 1200, 1)).toEqual({ pointsUsed: 700, shortageYen: 500 });
    expect(splitPayment(0, 1200, 2)).toEqual({ pointsUsed: 0, shortageYen: 2400 });
  });
  it("3つの精算方式（1円未満切り捨て）", () => {
    const common = { ratioBp: 8000, unitPrice: 520, yenPerPoint: 1, listPrice: 1350 };
    expect(computeSettlement({ ...common, method: "points_ratio", pointsUsed: 1199, shortageYen: 0 })).toBe(959);
    expect(computeSettlement({ ...common, method: "list_ratio", pointsUsed: 700, shortageYen: 500 })).toBe(580);
    expect(computeSettlement({ ...common, method: "unit", pointsUsed: 0, shortageYen: 900 })).toBe(0);
    expect(computeSettlement({ ...common, method: "unit", pointsUsed: 550, shortageYen: 0 })).toBe(520);
  });
});

describe("CSV", () => {
  it("日付の表記ゆれ", () => {
    expect(normalizeDate("2026/4/1")).toBe("2026-04-01");
    expect(normalizeDate("2026年4月1日")).toBe("2026-04-01");
    expect(normalizeDate("2026-02-30")).toBe("invalid");
    expect(normalizeDate("")).toBeNull();
  });
  it("Excel向け出力と数式インジェクション対策", () => {
    const s = toCsv(["a", "b"], [["=SUM(A1)", "-500"], ['x,"y"', null]]);
    expect(s.startsWith("﻿")).toBe(true);
    expect(s).toContain("'=SUM(A1),-500");
    expect(s).toContain('"x,""y""",');
  });
  it("Shift_JIS のCSVを読める", () => {
    // 「氏名」(Shift_JIS: 8E 81 96 BC)
    const sjis = new Uint8Array([0x8e, 0x81, 0x96, 0xbc]);
    expect(decodeCsvBytes(sjis.buffer)).toBe("氏名");
    expect(decodeCsvBytes(new TextEncoder().encode("﻿氏名").buffer as ArrayBuffer)).toBe("氏名");
  });
});

describe("日替わりの色", () => {
  it("同じ日は同じ、前日とは違う色", () => {
    expect(dailyMark("2026-10-07")).toEqual(dailyMark("2026-10-07"));
    for (let d = 1; d < 28; d++) {
      const a = dailyMark(`2026-11-${String(d).padStart(2, "0")}`);
      const b = dailyMark(`2026-11-${String(d + 1).padStart(2, "0")}`);
      expect(a.color.name).not.toBe(b.color.name);
    }
  });
});
