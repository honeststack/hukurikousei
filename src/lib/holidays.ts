import { parseCsv, normalizeDate } from "./csv";

/** 内閣府「国民の祝日」CSV（syukujitsu.csv）または「日付,名称」形式のCSVを読む */
export function parseHolidayCsv(text: string): { date: string; name: string }[] {
  const { header, rows } = parseCsv(text);
  const all = /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(header[0] ?? "") ? [header, ...rows] : rows;
  const out: { date: string; name: string }[] = [];
  for (const r of all) {
    const d = normalizeDate(r[0] ?? "");
    if (!d || d === "invalid") continue;
    out.push({ date: d, name: (r[1] ?? "祝日").trim() || "祝日" });
  }
  return out;
}

/** 初期データ用（2026〜2027年）。毎年、内閣府のCSVを取り込んで更新する。 */
export const BUILTIN_HOLIDAYS: { date: string; name: string }[] = [
  { date: "2026-01-01", name: "元日" },
  { date: "2026-01-12", name: "成人の日" },
  { date: "2026-02-11", name: "建国記念の日" },
  { date: "2026-02-23", name: "天皇誕生日" },
  { date: "2026-03-20", name: "春分の日" },
  { date: "2026-04-29", name: "昭和の日" },
  { date: "2026-05-03", name: "憲法記念日" },
  { date: "2026-05-04", name: "みどりの日" },
  { date: "2026-05-05", name: "こどもの日" },
  { date: "2026-05-06", name: "休日" },
  { date: "2026-07-20", name: "海の日" },
  { date: "2026-08-11", name: "山の日" },
  { date: "2026-09-21", name: "敬老の日" },
  { date: "2026-09-22", name: "休日" },
  { date: "2026-09-23", name: "秋分の日" },
  { date: "2026-10-12", name: "スポーツの日" },
  { date: "2026-11-03", name: "文化の日" },
  { date: "2026-11-23", name: "勤労感謝の日" },
  { date: "2027-01-01", name: "元日" },
  { date: "2027-01-11", name: "成人の日" },
  { date: "2027-02-11", name: "建国記念の日" },
  { date: "2027-02-23", name: "天皇誕生日" },
  { date: "2027-03-21", name: "春分の日" },
  { date: "2027-03-22", name: "休日" },
  { date: "2027-04-29", name: "昭和の日" },
  { date: "2027-05-03", name: "憲法記念日" },
  { date: "2027-05-04", name: "みどりの日" },
  { date: "2027-05-05", name: "こどもの日" },
  { date: "2027-07-19", name: "海の日" },
  { date: "2027-08-11", name: "山の日" },
  { date: "2027-09-20", name: "敬老の日" },
  { date: "2027-09-23", name: "秋分の日" },
  { date: "2027-10-11", name: "スポーツの日" },
  { date: "2027-11-03", name: "文化の日" },
  { date: "2027-11-23", name: "勤労感謝の日" },
];
