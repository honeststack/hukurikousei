import { hmac } from "./crypto";
import { jstDate, type Ymd } from "./time";

/** 日替わりの色（暖簾・札の縁・入館証の印）。前日以前の画面は色で見分けられる。 */
export const DAILY_COLORS = [
  { name: "藍", hex: "#2e4866", ink: "#ffffff" },
  { name: "臙脂", hex: "#7b2f3b", ink: "#ffffff" },
  { name: "松葉", hex: "#3d5e48", ink: "#ffffff" },
  { name: "山吹", hex: "#b0832c", ink: "#ffffff" },
  { name: "藤", hex: "#685d8c", ink: "#ffffff" },
  { name: "弁柄", hex: "#8e4630", ink: "#ffffff" },
  { name: "鉛", hex: "#4a4e55", ink: "#ffffff" },
] as const;

export const DAILY_SEALS = ["松", "竹", "梅", "鶴", "亀", "桜", "楓", "菊", "波", "雲", "月", "湯"] as const;

export type DailyMark = { date: Ymd; color: (typeof DAILY_COLORS)[number]; seal: string };

const dayNumber = (date: Ymd) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
};

/** 週ごとに秘密鍵から決まる7色の並び。週内は毎日違う色になる。 */
function rawWeek(week: number): number[] {
  const h = hmac(`daily-week:${week}`);
  const perm = [0, 1, 2, 3, 4, 5, 6];
  for (let i = perm.length - 1; i > 0; i--) {
    const j = h[i] % (i + 1);
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  return perm;
}

function week(weekNo: number): number[] {
  const perm = rawWeek(weekNo);
  // 週の変わり目で前日と同じ色にならないよう、先頭2日を入れ替える
  if (perm[0] === rawWeek(weekNo - 1)[6]) [perm[0], perm[1]] = [perm[1], perm[0]];
  return perm;
}

/**
 * サーバーの秘密鍵と日付から決まり、毎日違う色になる。
 * 施設には事前共有しない（当日の色は会員画面を見れば分かる）。
 */
export function dailyMark(date: Ymd): DailyMark {
  const n = dayNumber(date);
  const c = week(Math.floor(n / 7))[((n % 7) + 7) % 7];
  const seal = DAILY_SEALS[hmac(`daily-seal:${date}`)[0] % DAILY_SEALS.length];
  return { date, color: DAILY_COLORS[c], seal };
}

export function todayMark(now = new Date()): DailyMark {
  return dailyMark(jstDate(now));
}
