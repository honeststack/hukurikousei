/**
 * 入館・ポイント・取消・月次切替・精算の一連の流れ（メモリ上のPostgreSQLで実行）
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

process.env.PGLITE_DIR = "memory://";

const { getDb, closeDb, schema } = await import("@/db");
const { performCheckin, cancelCheckin, quoteCheckin } = await import("@/lib/checkin");
const { balanceOf, rolloverMemberById, addAdjustment } = await import("@/lib/ledger");
const { prepareStatements, startReview, closeStatement, facilityDispute, facilityConfirm, statementLines } = await import(
  "@/lib/statements"
);
const { runDaily } = await import("@/lib/monthly");
const { planImport, applyImport } = await import("@/lib/members");
const { companyReport } = await import("@/lib/reports");
const { jstToDate } = await import("@/lib/time");

type DB = Awaited<ReturnType<typeof getDb>>;
let db: DB;
const ids = {} as Record<string, string>;
const admin = { kind: "staff" as const, id: "00000000-0000-0000-0000-000000000001", name: "テスト運営" };
let seq = 0;
const key = () => `test-key-${String(++seq).padStart(6, "0")}-abcdefgh`;

async function checkin(memberId: string, at: Date, courseId = ids.course, extra: Partial<Parameters<typeof performCheckin>[1]> = {}) {
  return performCheckin(
    db,
    { memberId, qrToken: "test-qr-token-1", courseId, idempotencyKey: key(), deviceId: `dev-${memberId}`, ip: "", userAgent: "", lat: null, lng: null, ...extra },
    at,
  );
}

beforeAll(async () => {
  db = await getDb();
  const [op] = await db.insert(schema.operators).values({ name: "テスト運営会社" }).returning();
  const [f] = await db
    .insert(schema.facilities)
    .values({ operatorId: op.id, name: "テスト湯", daySwitchMinutes: 300, lat: 35.0, lng: 139.0, closedWeekdays: 0b0000010 })
    .returning();
  const [c] = await db.insert(schema.courses).values({ facilityId: f.id, name: "入浴" }).returning();
  await db.insert(schema.coursePrices).values({ courseId: c.id, effectiveFrom: "2026-01-01", points: 1200, listPrice: 1350 });
  await db.insert(schema.coursePrices).values({ courseId: c.id, effectiveFrom: "2026-11-01", points: 1300, listPrice: 1450 });
  await db.insert(schema.settlementTerms).values({ facilityId: f.id, method: "points_ratio", ratioBp: 8000, effectiveFrom: "2026-01-01" });
  await db.insert(schema.surchargeRules).values({
    facilityId: f.id,
    label: "土日祝料金",
    amount: 300,
    weekdays: 0b1000001,
    onHoliday: true,
    effectiveFrom: "2026-01-01",
  });
  await db.insert(schema.holidays).values({ date: "2026-10-12", name: "スポーツの日" });
  await db.insert(schema.facilityQrs).values({ facilityId: f.id, token: "test-qr-token-1" });
  const [co] = await db.insert(schema.companies).values({ name: "テスト株式会社" }).returning();
  await db.insert(schema.contracts).values({
    companyId: co.id,
    startsOn: "2026-01-01",
    monthlyPoints: 5000,
    carryover: "none",
    billingBasis: "per_member",
    feePerMember: 3000,
  });
  const [co2] = await db.insert(schema.companies).values({ name: "繰越株式会社" }).returning();
  await db.insert(schema.contracts).values({ companyId: co2.id, startsOn: "2026-01-01", monthlyPoints: 3000, carryover: "cap", carryoverCap: 2000 });
  const [m] = await db
    .insert(schema.members)
    .values({ companyId: co.id, employeeNo: "001", name: "試験 太郎", email: "t1@example.com", startsOn: "2026-01-01", passwordHash: "x" })
    .returning();
  const [m2] = await db
    .insert(schema.members)
    .values({ companyId: co2.id, employeeNo: "002", name: "試験 次郎", email: "t2@example.com", startsOn: "2026-01-01", passwordHash: "x" })
    .returning();
  Object.assign(ids, { facility: f.id, course: c.id, company: co.id, company2: co2.id, member: m.id, member2: m2.id });
});

afterAll(async () => {
  await closeDb();
});

describe("入館とポイント", () => {
  it("月初に付与され、入館でポイントが減る", async () => {
    const at = jstToDate("2026-10-07", 12 * 60);
    await db.transaction((tx) => rolloverMemberById(tx, ids.member, at));
    expect(await balanceOf(db, ids.member)).toBe(5000);
    const r = await checkin(ids.member, at);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.checkin.pointsUsed).toBe(1200);
    expect(r.checkin.shortageYen).toBe(0);
    expect(r.checkin.settlementAmount).toBe(960);
    expect(r.checkin.surchargeYen).toBe(0);
    expect(await balanceOf(db, ids.member)).toBe(3800);
  });

  it("同じ営業日の2回目は入館できない（深夜も同じ営業日）", async () => {
    const r = await checkin(ids.member, jstToDate("2026-10-08", 3 * 60));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("already");
  });

  it("同じ操作の再送は最初の結果を返す（二重消費しない）", async () => {
    const k = key();
    const at = jstToDate("2026-10-09", 12 * 60);
    const a = await checkin(ids.member, at, ids.course, { idempotencyKey: k });
    const b = await checkin(ids.member, at, ids.course, { idempotencyKey: k });
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.checkin.id).toBe(a.checkin.id);
      expect(b.replay).toBe(true);
    }
    expect(await balanceOf(db, ids.member)).toBe(2600);
  });

  it("同時に2件確定しても1件だけ成立する", async () => {
    const at = jstToDate("2026-10-10", 12 * 60);
    const [a, b] = await Promise.all([checkin(ids.member, at), checkin(ids.member, at)]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    expect(await balanceOf(db, ids.member)).toBe(1400);
  });

  it("祝日は追加料金（定休日の月曜でも祝日は営業）、定休日は入館不可", async () => {
    const [m] = await db.select().from(schema.members).where(eq(schema.members.id, ids.member));
    const [f] = await db.select().from(schema.facilities).where(eq(schema.facilities.id, ids.facility));
    const q = await quoteCheckin(db, m, f, jstToDate("2026-10-12", 12 * 60));
    expect(q.surcharge.total).toBe(300);
    expect(q.blocked).toBeNull();
    const closed = await checkin(ids.member, jstToDate("2026-10-13", 12 * 60)); // 月曜は定休日だが10/13は火曜
    expect(closed.ok).toBe(true);
    const mon = await checkin(ids.member, jstToDate("2026-10-19", 12 * 60));
    expect(mon.ok).toBe(false);
    if (!mon.ok) expect(mon.code).toBe("closed");
  });

  it("残高不足は差額を店頭払いにして入館できる", async () => {
    expect(await balanceOf(db, ids.member)).toBe(200);
    const r = await checkin(ids.member, jstToDate("2026-10-14", 12 * 60));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.checkin.pointsUsed).toBe(200);
    expect(r.checkin.shortageYen).toBe(1000);
    expect(r.checkin.settlementAmount).toBe(160);
    expect(await balanceOf(db, ids.member)).toBe(0);
  });

  it("表示後に料金が変わっていたら確定しない", async () => {
    const r = await checkin(ids.member, jstToDate("2026-10-15", 12 * 60), ids.course, { expectedPayAtDesk: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("changed");
  });

  it("施設から遠い入館と、同じ端末での別会員の入館に印が付く", async () => {
    await addAdjustment(db, ids.member, 5000, "テスト", "test", jstToDate("2026-10-16", 600));
    const r = await checkin(ids.member, jstToDate("2026-10-16", 12 * 60), ids.course, { lat: 35.5, lng: 139.5, deviceId: "shared-dev" });
    expect(r.ok && r.checkin.flags).toContain("far");
    await db.transaction((tx) => rolloverMemberById(tx, ids.member2, jstToDate("2026-10-16", 600)));
    const r2 = await checkin(ids.member2, jstToDate("2026-10-16", 13 * 60), ids.course, { deviceId: "shared-dev" });
    expect(r2.ok && r2.checkin.flags).toContain("shared_device");
  });
});

describe("取消", () => {
  it("会員は3分以内なら自分で取り消せ、ポイントが戻る", async () => {
    const at = jstToDate("2026-10-17", 12 * 60);
    const before = await balanceOf(db, ids.member);
    const r = await checkin(ids.member, at);
    if (!r.ok) throw new Error(r.message);
    const actor = { kind: "member" as const, id: ids.member, name: "試験 太郎" };
    const late = await cancelCheckin(db, r.checkin.id, { kind: "member", actor }, "間違えた", new Date(at.getTime() + 4 * 60 * 1000));
    expect(late.ok).toBe(false);
    const ok = await cancelCheckin(db, r.checkin.id, { kind: "member", actor }, "間違えた", new Date(at.getTime() + 2 * 60 * 1000));
    expect(ok.ok).toBe(true);
    expect(await balanceOf(db, ids.member)).toBe(before);
    // 取り消した日は再入館できる
    const again = await checkin(ids.member, new Date(at.getTime() + 5 * 60 * 1000));
    expect(again.ok).toBe(true);
  });

  it("施設は当日分だけ取り消せる", async () => {
    const at = jstToDate("2026-10-18", 12 * 60);
    const r = await checkin(ids.member, at);
    if (!r.ok) throw new Error(r.message);
    const fac = { kind: "facility" as const, actor: admin, facilityIds: [ids.facility] };
    const next = await cancelCheckin(db, r.checkin.id, fac, "誤登録", jstToDate("2026-10-19", 6 * 60));
    expect(next.ok).toBe(false);
    const same = await cancelCheckin(db, r.checkin.id, fac, "誤登録", jstToDate("2026-10-19", 4 * 60)); // 5時切替の前は同じ営業日
    expect(same.ok).toBe(true);
  });
});

describe("月次切替と精算", () => {
  it("翌月1日に前月分が失効して付与される（何度実行しても同じ）", async () => {
    const nov = jstToDate("2026-11-01", 1);
    await runDaily(db, nov);
    await runDaily(db, nov);
    expect(await balanceOf(db, ids.member)).toBe(5000);
    const grants = await db
      .select()
      .from(schema.pointEntries)
      .where(and(eq(schema.pointEntries.memberId, ids.member), eq(schema.pointEntries.kind, "grant"), eq(schema.pointEntries.period, "2026-11")));
    expect(grants.length).toBe(1);
  });

  it("繰越ありの契約は上限まで残る", async () => {
    // 次郎: 10月 3000 付与 − 1200 使用 = 1800 → 繰越 1800、11月付与 3000
    expect(await balanceOf(db, ids.member2)).toBe(4800);
  });

  it("新しい料金は適用開始日から使われ、過去の記録は変わらない", async () => {
    const r = await checkin(ids.member, jstToDate("2026-11-04", 12 * 60));
    expect(r.ok && r.checkin.pointsRequired).toBe(1300);
    const [old] = await db.select().from(schema.checkins).where(eq(schema.checkins.businessDate, "2026-10-07"));
    expect(old.pointsRequired).toBe(1200);
  });

  it("確定は施設確認の後。確定後の取消は当月のマイナス行になる", async () => {
    const now = jstToDate("2026-11-03", 10 * 60);
    const [st] = await prepareStatements(db, "2026-10").then((l) => l.filter((s) => s.facilityId === ids.facility));
    const lines = await statementLines(db, ids.facility, "2026-10", st);
    expect(st.totalAmount).toBe(lines.totalAmount);
    expect((await closeStatement(db, st.id, admin, now)).ok).toBe(false);
    expect((await startReview(db, st.id, admin, now)).ok).toBe(true);
    await facilityDispute(db, st.id, admin, "10/14 の件を確認したい", now);
    expect((await closeStatement(db, st.id, admin, now)).ok).toBe(false);
    await facilityConfirm(db, st.id, admin, now);
    expect((await closeStatement(db, st.id, admin, now)).ok).toBe(true);

    const [target] = await db.select().from(schema.checkins).where(eq(schema.checkins.businessDate, "2026-10-14"));
    const c = await cancelCheckin(db, target.id, { kind: "admin", actor: admin }, "施設からの申告", now);
    expect(c.ok).toBe(true);
    const [closed] = await db.select().from(schema.statements).where(eq(schema.statements.id, st.id));
    expect(closed.totalAmount).toBe(st.totalAmount); // 確定済みは変わらない
    const adj = await db
      .select()
      .from(schema.settlementAdjustments)
      .where(and(eq(schema.settlementAdjustments.facilityId, ids.facility), eq(schema.settlementAdjustments.period, "2026-11")));
    expect(adj.map((a) => a.amount)).toEqual([-160]);
    const after = await statementLines(db, ids.facility, "2026-10", closed);
    expect(after.totalAmount).toBe(closed.totalAmount);
  });

  it("ポイント台帳は書き換えられない", async () => {
    await expect(db.delete(schema.pointEntries)).rejects.toThrow();
  });

  it("企業別の集計", async () => {
    const rows = await companyReport(db, "2026-10", ids.company);
    expect(rows[0].members).toBe(1);
    expect(rows[0].users).toBe(1);
    expect(rows[0].billingAmount).toBe(3000);
  });
});

describe("CSV一括登録", () => {
  it("新規・変更・停止・エラーを分けてプレビューし、反映できる", async () => {
    const csv = [
      "社員番号,氏名,メールアドレス,利用開始日,利用停止日",
      "001,試験 太郎,t1@example.com,2026/01/01,2027/03/31",
      "003,新人 三郎,t3@example.com,2026/11/01,",
      "004,重複 四郎,t1@example.com,2026/11/01,",
      "005,日付 五郎,t5@example.com,2026/13/01,",
    ].join("\n");
    const r = await planImport(db, ids.company, csv, { missingAction: "keep", today: "2026-11-03" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.counts).toMatchObject({ create: 1, stop: 1, error: 2 });
    const created = await applyImport(db, ids.company, r.plan, admin);
    expect(created.map((m) => m.employeeNo)).toEqual(["003"]);
    const [taro] = await db.select().from(schema.members).where(eq(schema.members.id, ids.member));
    expect(taro.stopsOn).toBe("2027-03-31");
  });

  it("見出しが足りないCSVは受け付けない", async () => {
    const r = await planImport(db, ids.company, "名前,メール\nA,a@example.com", { missingAction: "keep", today: "2026-11-03" });
    expect(r.ok).toBe(false);
  });
});
