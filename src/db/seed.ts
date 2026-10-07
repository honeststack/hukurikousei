/**
 * デモ用の初期データ。実際の入館処理（performCheckin）を過去の日時で実行して、
 * 前月・当月の利用履歴、ポイント台帳、精算明細を作る。
 */
import { and, eq } from "drizzle-orm";
import { schema, type DB } from "./index";
import { hashPassword } from "@/lib/crypto";
import { BUILTIN_HOLIDAYS } from "@/lib/holidays";
import { performCheckin, cancelCheckin } from "@/lib/checkin";
import { rolloverMember } from "@/lib/ledger";
import { startReview } from "@/lib/statements";
import { runDaily } from "@/lib/monthly";
import { saveSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { addDays, addMonths, currentPeriod, firstDayOf, jstDate, jstToDate } from "@/lib/time";
import { SYSTEM_ACTOR } from "@/lib/audit";

export const DEMO_PASSWORD = "yufuda2026";

/** 再現性のある疑似乱数 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export async function seed(db: DB, now = new Date()) {
  const [exists] = await db.select({ id: schema.companies.id }).from(schema.companies).limit(1);
  if (exists) return { skipped: true as const };

  const pw = await hashPassword(DEMO_PASSWORD);
  const today = jstDate(now);
  const period = currentPeriod(now);
  const prevPeriod = addMonths(period, -1);
  const prevFirst = firstDayOf(prevPeriod);
  const yearAgo = addDays(today, -365);

  await saveSettings(DEFAULT_SETTINGS, db);
  await db.insert(schema.holidays).values(BUILTIN_HOLIDAYS).onConflictDoNothing();
  await db.insert(schema.specialDays).values([
    { date: "2026-12-29", label: "年末年始" },
    { date: "2026-12-30", label: "年末年始" },
    { date: "2026-12-31", label: "年末年始" },
    { date: "2027-01-02", label: "年末年始" },
    { date: "2027-01-03", label: "年末年始" },
  ]);

  /* ── 提携施設 ── */
  const [opA] = await db
    .insert(schema.operators)
    .values({ name: "株式会社ゆけむり商会", contactEmail: "keiri@yukemuri.example", bankInfo: "みずほ銀行 港支店 普通 1234567 カ）ユケムリシヨウカイ", invoiceNo: "T1234567890123" })
    .returning();
  const [opB] = await db
    .insert(schema.operators)
    .values({ name: "有限会社 松乃湯", contactEmail: "matsunoyu@example.com", bankInfo: "城北信用金庫 本店 普通 7654321 ユ）マツノユ", invoiceNo: "T9876543210987" })
    .returning();

  const facilitySeeds = [
    {
      operatorId: opA.id,
      name: "天然温泉 みなと湯",
      nameKana: "テンネンオンセン ミナトユ",
      area: "東京都港区",
      address: "東京都港区芝浦3-0-0",
      phone: "03-1111-2222",
      lat: 35.6425,
      lng: 139.7487,
      hoursText: "10:00〜翌9:00（最終受付 翌8:00）",
      daySwitchMinutes: 300,
      closedWeekdays: 0,
      description: "地下1,500mから汲み上げる黒湯の天然温泉。露天風呂と高温サウナ、深夜も営業。",
      notes: "館内着・タオルセットはコースに含まれます",
    },
    {
      operatorId: opA.id,
      name: "サウナと岩盤浴 森の湯",
      nameKana: "サウナトガンバンヨク モリノユ",
      area: "東京都品川区",
      address: "東京都品川区大崎2-0-0",
      phone: "03-3333-4444",
      lat: 35.6197,
      lng: 139.7286,
      hoursText: "9:00〜24:00",
      daySwitchMinutes: 240,
      closedWeekdays: 0,
      description: "セルフロウリュのフィンランドサウナと、5種類の岩盤浴。外気浴スペースあり。",
      notes: "岩盤浴は館内着着用",
    },
    {
      operatorId: opB.id,
      name: "銭湯 松乃湯",
      nameKana: "セントウ マツノユ",
      area: "東京都台東区",
      address: "東京都台東区谷中1-0-0",
      phone: "03-5555-6666",
      lat: 35.7266,
      lng: 139.7672,
      hoursText: "15:00〜24:00（月曜定休）",
      daySwitchMinutes: 180,
      closedWeekdays: 0b0000010,
      description: "昭和二十八年創業。富士山のペンキ絵とサウナのある町の銭湯。",
      notes: "タオルは受付で貸出（コースに含む）",
    },
  ];
  const facilities = await db.insert(schema.facilities).values(facilitySeeds).returning();
  const [minato, mori, matsu] = facilities;

  const courseSeeds: { f: typeof minato; name: string; includes: string; duration: string; points: number; list: number }[] = [
    { f: minato, name: "入浴のみ", includes: "館内着・タオルセット", duration: "時間制限なし（当日中）", points: 1200, list: 1350 },
    { f: minato, name: "入浴＋岩盤浴", includes: "館内着・タオルセット・岩盤浴", duration: "時間制限なし（当日中）", points: 1800, list: 2050 },
    { f: minato, name: "入浴＋ボディケア30分", includes: "館内着・タオル・ボディケア30分", duration: "当日中", points: 4200, list: 4800 },
    { f: mori, name: "サウナ 3時間", includes: "館内着・タオル・サウナハット貸出", duration: "3時間", points: 1500, list: 1700 },
    { f: mori, name: "サウナ＋岩盤浴 1日", includes: "館内着・タオル・岩盤浴", duration: "当日中", points: 2400, list: 2700 },
    { f: matsu, name: "入浴（サウナ付き）", includes: "タオル貸出・サウナ", duration: "時間制限なし", points: 900, list: 1000 },
    { f: matsu, name: "入浴のみ", includes: "タオル貸出", duration: "時間制限なし", points: 550, list: 550 },
  ];
  const courses: (typeof schema.courses.$inferSelect)[] = [];
  for (const [i, c] of courseSeeds.entries()) {
    const [row] = await db
      .insert(schema.courses)
      .values({ facilityId: c.f.id, name: c.name, includes: c.includes, durationText: c.duration, sort: i })
      .returning();
    await db.insert(schema.coursePrices).values({ courseId: row.id, effectiveFrom: yearAgo, points: c.points, listPrice: c.list });
    courses.push(row);
  }

  const ALL = 127;
  const WEEKEND = 0b1000001;
  await db.insert(schema.surchargeRules).values([
    { facilityId: minato.id, label: "土日祝料金", amount: 300, weekdays: WEEKEND, onHoliday: true, groupKey: "day", priority: 10, effectiveFrom: yearAgo },
    { facilityId: minato.id, label: "特別料金日", amount: 500, weekdays: 0, onSpecialDay: true, groupKey: "day", priority: 20, effectiveFrom: yearAgo },
    { facilityId: minato.id, label: "深夜料金", amount: 1500, weekdays: ALL, timeFrom: 60, timeTo: 300, kind: "stay", effectiveFrom: yearAgo },
    { facilityId: mori.id, label: "土日祝料金", amount: 400, weekdays: WEEKEND, onHoliday: true, groupKey: "day", priority: 10, effectiveFrom: yearAgo },
    { facilityId: mori.id, label: "夜間入館", amount: 200, weekdays: ALL, timeFrom: 1260, timeTo: 240, kind: "entry", effectiveFrom: yearAgo },
    { facilityId: matsu.id, label: "日曜・祝日 朝湯", amount: 100, weekdays: 0b0000001, onHoliday: true, timeFrom: 360, timeTo: 720, kind: "entry", effectiveFrom: yearAgo },
  ]);

  await db.insert(schema.settlementTerms).values([
    { facilityId: minato.id, method: "points_ratio", ratioBp: 8000, effectiveFrom: yearAgo },
    { facilityId: mori.id, method: "list_ratio", ratioBp: 7500, effectiveFrom: yearAgo },
    { facilityId: matsu.id, method: "unit", ratioBp: 10000, unitPrice: 520, effectiveFrom: yearAgo },
    { facilityId: matsu.id, courseId: courses[5].id, method: "unit", ratioBp: 10000, unitPrice: 860, effectiveFrom: yearAgo },
  ]);

  await db.insert(schema.facilityQrs).values([
    { facilityId: minato.id, token: "demo-minato-front", label: "1F 受付カウンター" },
    { facilityId: mori.id, token: "demo-mori-front", label: "2F フロント" },
    { facilityId: matsu.id, token: "demo-matsu-bandai", label: "番台横" },
  ]);
  await db.insert(schema.facilityClosures).values({ facilityId: mori.id, date: addDays(today, 9), note: "設備点検" });

  /* ── 導入企業 ── */
  const [coA] = await db
    .insert(schema.companies)
    .values({ name: "株式会社サンプル商事", contactName: "人事部 佐藤", contactEmail: "jinji@sample-shoji.example", billingAddress: "東京都千代田区丸の内1-0-0" })
    .returning();
  const [coB] = await db
    .insert(schema.companies)
    .values({ name: "ミライ工業株式会社", contactName: "総務課 田中", contactEmail: "soumu@mirai-kogyo.example", billingAddress: "神奈川県川崎市幸区0-0" })
    .returning();
  await db.insert(schema.contracts).values([
    { companyId: coA.id, startsOn: yearAgo, monthlyPoints: 5000, carryover: "none", billingBasis: "per_member", feePerMember: 3000, midMonthGrant: "full" },
    {
      companyId: coB.id,
      startsOn: yearAgo,
      monthlyPoints: 3000,
      carryover: "cap",
      carryoverCap: 3000,
      billingBasis: "usage",
      midMonthGrant: "next",
      facilityScope: "all",
      showIndividualUsage: true,
    },
  ]);

  const people: [string, string, string, string, string, string | null][] = [
    // 社員番号, 氏名, フリガナ, メール, 部署, 会社
    ["A1001", "山田 花子", "ヤマダ ハナコ", "demo@example.com", "営業部", "A"],
    ["A1002", "鈴木 一郎", "スズキ イチロウ", "suzuki@sample-shoji.example", "営業部", "A"],
    ["A1003", "高橋 美咲", "タカハシ ミサキ", "takahashi@sample-shoji.example", "経理部", "A"],
    ["A1004", "伊藤 健太", "イトウ ケンタ", "ito@sample-shoji.example", "開発部", "A"],
    ["A1005", "渡辺 真由", "ワタナベ マユ", "watanabe@sample-shoji.example", "人事部", "A"],
    ["A1006", "中村 翔", "ナカムラ ショウ", "nakamura@sample-shoji.example", "開発部", "A"],
    ["A1007", "小林 さくら", "コバヤシ サクラ", "kobayashi@sample-shoji.example", "総務部", "A"],
    ["B2001", "加藤 大輔", "カトウ ダイスケ", "kato@mirai-kogyo.example", "製造一課", "B"],
    ["B2002", "吉田 恵", "ヨシダ メグミ", "yoshida@mirai-kogyo.example", "品質保証", "B"],
    ["B2003", "山口 拓也", "ヤマグチ タクヤ", "yamaguchi@mirai-kogyo.example", "製造二課", "B"],
    ["B2004", "松本 彩", "マツモト アヤ", "matsumoto@mirai-kogyo.example", "総務課", "B"],
  ];
  const members: (typeof schema.members.$inferSelect)[] = [];
  for (const [no, name, kana, email, dept, co] of people) {
    const invitedOnly = no === "A1007" || no === "B2004";
    const [m] = await db
      .insert(schema.members)
      .values({
        companyId: co === "A" ? coA.id : coB.id,
        employeeNo: no,
        name,
        nameKana: kana,
        email,
        department: dept,
        startsOn: no === "B2004" ? addDays(today, -3) : yearAgo,
        stopsOn: no === "A1006" ? addDays(today, 20) : null,
        passwordHash: invitedOnly ? null : pw,
        invitedAt: now,
      })
      .returning();
    members.push(m);
  }

  /* ── 担当者アカウント ── */
  await db.insert(schema.staffUsers).values([
    { email: "admin@example.com", name: "運営 管理者", role: "admin", passwordHash: pw },
    { email: "ops@example.com", name: "運営 担当", role: "operator", passwordHash: pw },
    { email: "hr@sample-shoji.example", name: "佐藤（人事部）", role: "company", companyId: coA.id, passwordHash: pw },
    { email: "soumu@mirai-kogyo.example", name: "田中（総務課）", role: "company", companyId: coB.id, passwordHash: pw },
    { email: "front@yukemuri.example", name: "ゆけむり 本部", role: "facility", operatorId: opA.id, passwordHash: pw },
    { email: "matsunoyu@example.com", name: "松乃湯 店主", role: "facility", operatorId: opB.id, passwordHash: pw },
  ]);

  await db.insert(schema.notices).values([
    {
      title: "「銭湯 松乃湯」が新しく加わりました",
      body: "谷中の町の銭湯「松乃湯」でも湯札が使えるようになりました。サウナ付きの入浴は900ポイントです。",
      createdBy: "運営 管理者",
      publishedAt: addDaysDate(now, -6),
    },
    {
      title: "サウナと岩盤浴 森の湯 臨時休館のお知らせ",
      body: `設備点検のため ${addDays(today, 9).replace(/-/g, "/")} は臨時休館です。`,
      audience: "facility",
      facilityId: mori.id,
      createdBy: "運営 管理者",
      publishedAt: addDaysDate(now, -1),
    },
  ]);

  /* ── 前月1日〜昨日までの利用履歴 ── */
  const rand = rng(20261007);
  const qrs = await db.select().from(schema.facilityQrs);
  const qrOf = (fid: string) => qrs.find((q) => q.facilityId === fid)!.token;
  const coursesOf = (fid: string) => courses.filter((c) => c.facilityId === fid);
  const active = members.filter((m) => m.passwordHash);
  let n = 0;
  for (let d = prevFirst; d < today; d = addDays(d, 1)) {
    if (d === prevFirst || d === firstDayOf(period)) {
      for (const m of members) {
        const at = jstToDate(d, 1);
        if (m.startsOn > d) continue;
        await db.transaction(async (tx) => {
          const [row] = await tx.select().from(schema.members).where(eq(schema.members.id, m.id)).for("update");
          await rolloverMember(tx, row, at);
        });
      }
    }
    for (const m of active) {
      if (m.email === "demo@example.com" && d >= addDays(today, -1)) continue;
      if (rand() > 0.1) continue;
      const f = facilities[Math.floor(rand() * facilities.length)];
      const list = coursesOf(f.id);
      const course = list[Math.floor(rand() * list.length)];
      const minute = 11 * 60 + Math.floor(rand() * 11 * 60);
      const at = jstToDate(d, minute);
      const r = await performCheckin(
        db,
        {
          memberId: m.id,
          qrToken: qrOf(f.id),
          courseId: course.id,
          idempotencyKey: `seed-${m.id}-${d}`,
          deviceId: `seed-device-${m.employeeNo}`,
          ip: "",
          userAgent: "seed",
          lat: f.lat! + (rand() - 0.5) * 0.002,
          lng: f.lng! + (rand() - 0.5) * 0.002,
        },
        at,
      );
      if (r.ok) {
        n++;
        if (n % 17 === 0) {
          await cancelCheckin(
            db,
            r.checkin.id,
            { kind: "admin", actor: { ...SYSTEM_ACTOR, name: "運営 管理者" } },
            "誤ってコースを選択したため",
            new Date(at.getTime() + 20 * 60 * 1000),
          );
        }
      }
    }
  }
  // 当月分の付与と精算の仮集計（毎日の定期処理と同じ）
  await runDaily(db, now);
  // 前月分のみなと湯は施設確認中にしておく
  const [st] = await db
    .select()
    .from(schema.statements)
    .where(and(eq(schema.statements.facilityId, minato.id), eq(schema.statements.period, prevPeriod)));
  if (st) await startReview(db, st.id, { ...SYSTEM_ACTOR, name: "運営 管理者" }, now);

  return { skipped: false as const, checkins: n };
}

function addDaysDate(d: Date, days: number) {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
