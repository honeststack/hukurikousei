import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });
const day = (name: string) => date(name, { mode: "string" });

/** システム設定（換算率など）。値はJSON。 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ───────── 導入企業 ───────── */

export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  contactName: text("contact_name").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  billingAddress: text("billing_address").notNull().default(""),
  note: text("note").notNull().default(""),
  archivedAt: ts("archived_at"),
  createdAt: createdAt(),
});

/** 企業契約。適用期間で履歴管理する。 */
export const contracts = pgTable(
  "contracts",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    startsOn: day("starts_on").notNull(),
    endsOn: day("ends_on"),
    monthlyPoints: integer("monthly_points").notNull(),
    /** none: 月末で全失効 / cap: 上限まで繰越 */
    carryover: text("carryover", { enum: ["none", "cap"] }).notNull().default("none"),
    carryoverCap: integer("carryover_cap").notNull().default(0),
    /** 月途中の利用開始者: full=開始日に当月分を付与 / next=翌月1日から */
    midMonthGrant: text("mid_month_grant", { enum: ["full", "next"] }).notNull().default("full"),
    /** all: 全提携施設 / selected: contract_facilities のみ */
    facilityScope: text("facility_scope", { enum: ["all", "selected"] }).notNull().default("all"),
    /** per_member: 会員数×月額 / usage: 利用ポイント×換算率 */
    billingBasis: text("billing_basis", { enum: ["per_member", "usage"] }).notNull().default("per_member"),
    feePerMember: integer("fee_per_member").notNull().default(0),
    /** 企業画面で個人別の利用明細を開示するか（契約で合意した場合のみ true） */
    showIndividualUsage: boolean("show_individual_usage").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("contracts_company_idx").on(t.companyId, t.startsOn)],
);

export const contractFacilities = pgTable(
  "contract_facilities",
  {
    contractId: uuid("contract_id").notNull().references(() => contracts.id, { onDelete: "cascade" }),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
  },
  (t) => [primaryKey({ columns: [t.contractId, t.facilityId] })],
);

/* ───────── 会員 ───────── */

export const members = pgTable(
  "members",
  {
    id: id(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    employeeNo: text("employee_no").notNull(),
    name: text("name").notNull(),
    nameKana: text("name_kana").notNull().default(""),
    email: text("email").notNull(),
    department: text("department").notNull().default(""),
    startsOn: day("starts_on").notNull(),
    /** この日以降は入館不可。null は無期限。 */
    stopsOn: day("stops_on"),
    passwordHash: text("password_hash"),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: ts("locked_until"),
    lastLoginAt: ts("last_login_at"),
    invitedAt: ts("invited_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("members_company_employee_uq").on(t.companyId, t.employeeNo),
    uniqueIndex("members_email_uq").on(sql`lower(${t.email})`),
  ],
);

/* ───────── 提携施設 ───────── */

/** 施設の運営会社（複数店舗を束ねる。精算の支払先） */
export const operators = pgTable("operators", {
  id: id(),
  name: text("name").notNull(),
  contactEmail: text("contact_email").notNull().default(""),
  bankInfo: text("bank_info").notNull().default(""),
  invoiceNo: text("invoice_no").notNull().default(""),
  createdAt: createdAt(),
});

export const facilities = pgTable("facilities", {
  id: id(),
  operatorId: uuid("operator_id").notNull().references(() => operators.id),
  name: text("name").notNull(),
  nameKana: text("name_kana").notNull().default(""),
  area: text("area").notNull().default(""),
  address: text("address").notNull().default(""),
  phone: text("phone").notNull().default(""),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  hoursText: text("hours_text").notNull().default(""),
  /** 営業日の切替時刻（0時からの分）。例: 300 = 朝5時 */
  daySwitchMinutes: integer("day_switch_minutes").notNull().default(300),
  /** 定休日の曜日ビット（bit0=日曜） */
  closedWeekdays: integer("closed_weekdays").notNull().default(0),
  /** 定休日の曜日でも祝日は営業する（「月曜定休・祝日は営業」） */
  openOnHolidays: boolean("open_on_holidays").notNull().default(true),
  description: text("description").notNull().default(""),
  notes: text("notes").notNull().default(""),
  status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
  createdAt: createdAt(),
});

/** 臨時休館日 */
export const facilityClosures = pgTable(
  "facility_closures",
  {
    id: id(),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
    date: day("date").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [uniqueIndex("facility_closures_uq").on(t.facilityId, t.date)],
);

export const courses = pgTable("courses", {
  id: id(),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  includes: text("includes").notNull().default(""),
  durationText: text("duration_text").notNull().default(""),
  sort: integer("sort").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** コースの必要ポイントと施設定価。適用開始日で履歴管理する。 */
export const coursePrices = pgTable(
  "course_prices",
  {
    id: id(),
    courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    effectiveFrom: day("effective_from").notNull(),
    points: integer("points").notNull(),
    listPrice: integer("list_price").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("course_prices_uq").on(t.courseId, t.effectiveFrom)],
);

/** 追加料金ルール（土日祝・深夜など）。追加料金は常に店頭払い。 */
export const surchargeRules = pgTable("surcharge_rules", {
  id: id(),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  amount: integer("amount").notNull(),
  /** 対象曜日ビット（bit0=日曜）。127=毎日 */
  weekdays: integer("weekdays").notNull().default(0),
  onHoliday: boolean("on_holiday").notNull().default(false),
  onSpecialDay: boolean("on_special_day").notNull().default(false),
  /** 時間帯（0時からの分）。null なら終日。from>to は日付をまたぐ。 */
  timeFrom: integer("time_from"),
  timeTo: integer("time_to"),
  /** entry: 入館時刻が時間帯内なら加算 / stay: 時間帯まで滞在した場合の予告のみ（店頭で精算） */
  kind: text("kind", { enum: ["entry", "stay"] }).notNull().default("entry"),
  /** 同じグループ内では優先順位の最も高い1件のみ適用。異なるグループは加算。 */
  groupKey: text("group_key").notNull().default(""),
  priority: integer("priority").notNull().default(0),
  effectiveFrom: day("effective_from").notNull(),
  effectiveTo: day("effective_to"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

/** 施設独自の特別料金日（GW・お盆・年末年始など）。facility_id が null なら全施設。 */
export const specialDays = pgTable(
  "special_days",
  {
    id: id(),
    facilityId: uuid("facility_id").references(() => facilities.id, { onDelete: "cascade" }),
    date: day("date").notNull(),
    label: text("label").notNull(),
  },
  (t) => [index("special_days_date_idx").on(t.date)],
);

export const holidays = pgTable("holidays", {
  date: day("date").primaryKey(),
  name: text("name").notNull(),
});

/** 精算条件。course_id が null なら施設全体の既定値。 */
export const settlementTerms = pgTable("settlement_terms", {
  id: id(),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
  /** points_ratio: 使用pt×換算率×比率 / list_ratio: 定価×比率−店頭収受の不足分 / unit: 1入館あたり定額 */
  method: text("method", { enum: ["points_ratio", "list_ratio", "unit"] }).notNull(),
  /** 比率（万分率）。8000 = 80% */
  ratioBp: integer("ratio_bp").notNull().default(10000),
  unitPrice: integer("unit_price").notNull().default(0),
  effectiveFrom: day("effective_from").notNull(),
  createdAt: createdAt(),
});

export const facilityQrs = pgTable("facility_qrs", {
  id: id(),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  label: text("label").notNull().default(""),
  issuedAt: ts("issued_at").notNull().defaultNow(),
  /** 再発行時に猶予期限を設定。期限後は無効。 */
  expiresAt: ts("expires_at"),
  revokedAt: ts("revoked_at"),
});

/* ───────── 入館とポイント ───────── */

export const checkins = pgTable(
  "checkins",
  {
    id: id(),
    memberId: uuid("member_id").notNull().references(() => members.id),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    courseId: uuid("course_id").notNull().references(() => courses.id),
    qrId: uuid("qr_id").references(() => facilityQrs.id),
    businessDate: day("business_date").notNull(),
    /** 精算対象月 YYYY-MM（営業日の月） */
    period: text("period").notNull(),
    checkedInAt: ts("checked_in_at").notNull().defaultNow(),
    // ↓ 入館時点の値の写し（後から料金を変えても変わらない）
    courseName: text("course_name").notNull(),
    pointsRequired: integer("points_required").notNull(),
    pointsUsed: integer("points_used").notNull(),
    yenPerPoint: integer("yen_per_point").notNull(),
    shortageYen: integer("shortage_yen").notNull(),
    surchargeYen: integer("surcharge_yen").notNull(),
    surchargeDetail: jsonb("surcharge_detail").$type<{ label: string; amount: number }[]>().notNull(),
    stayNotices: jsonb("stay_notices").$type<{ label: string; amount: number; from: number }[]>().notNull(),
    listPrice: integer("list_price").notNull(),
    settlementMethod: text("settlement_method").notNull(),
    settlementRatioBp: integer("settlement_ratio_bp").notNull(),
    settlementAmount: integer("settlement_amount").notNull(),
    status: text("status", { enum: ["active", "cancelled"] }).notNull().default("active"),
    cancelledAt: ts("cancelled_at"),
    cancelReason: text("cancel_reason"),
    cancelledByKind: text("cancelled_by_kind", { enum: ["member", "facility", "admin"] }),
    cancelledById: uuid("cancelled_by_id"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    deviceId: text("device_id").notNull().default(""),
    ip: text("ip").notNull().default(""),
    userAgent: text("user_agent").notNull().default(""),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    distanceM: integer("distance_m"),
    flags: jsonb("flags").$type<string[]>().notNull().default([]),
    flagsResolvedAt: ts("flags_resolved_at"),
    flagsResolvedBy: text("flags_resolved_by"),
  },
  (t) => [
    // 1日1回: 同じ会員・同じ営業日に有効な入館は1件まで
    uniqueIndex("checkins_member_day_uq").on(t.memberId, t.businessDate).where(sql`status = 'active'`),
    index("checkins_facility_day_idx").on(t.facilityId, t.businessDate),
    index("checkins_period_idx").on(t.period),
    index("checkins_device_idx").on(t.deviceId),
  ],
);

/** ポイント台帳（追記のみ）。残高はこの合計。 */
export const pointEntries = pgTable(
  "point_entries",
  {
    id: id(),
    memberId: uuid("member_id").notNull().references(() => members.id),
    kind: text("kind", { enum: ["grant", "use", "refund", "expire", "revoke", "adjust"] }).notNull(),
    amount: integer("amount").notNull(),
    period: text("period").notNull(),
    checkinId: uuid("checkin_id").references(() => checkins.id),
    note: text("note").notNull().default(""),
    createdBy: text("created_by").notNull().default("system"),
    createdAt: createdAt(),
  },
  (t) => [
    index("point_entries_member_idx").on(t.memberId, t.createdAt),
    uniqueIndex("point_entries_grant_uq").on(t.memberId, t.period).where(sql`kind = 'grant'`),
    uniqueIndex("point_entries_expire_uq").on(t.memberId, t.period).where(sql`kind = 'expire'`),
    uniqueIndex("point_entries_use_uq").on(t.checkinId).where(sql`kind = 'use'`),
    uniqueIndex("point_entries_refund_uq").on(t.checkinId).where(sql`kind = 'refund'`),
  ],
);

/** 月次処理（失効→付与→仮集計）の実行記録 */
export const monthlyRuns = pgTable("monthly_runs", {
  period: text("period").primaryKey(),
  status: text("status", { enum: ["running", "done", "failed"] }).notNull(),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  grantedCount: integer("granted_count").notNull().default(0),
  expiredCount: integer("expired_count").notNull().default(0),
  error: text("error"),
});

/* ───────── 精算 ───────── */

export const statements = pgTable(
  "statements",
  {
    id: id(),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    period: text("period").notNull(),
    /** draft: 仮集計 / review: 施設確認中 / closed: 確定（変更不可） */
    status: text("status", { enum: ["draft", "review", "closed"] }).notNull().default("draft"),
    checkinCount: integer("checkin_count").notNull().default(0),
    checkinAmount: integer("checkin_amount").notNull().default(0),
    adjustmentAmount: integer("adjustment_amount").notNull().default(0),
    totalAmount: integer("total_amount").notNull().default(0),
    reviewStartedAt: ts("review_started_at"),
    facilityConfirmedAt: ts("facility_confirmed_at"),
    facilityConfirmedBy: text("facility_confirmed_by"),
    disputeNote: text("dispute_note"),
    disputedAt: ts("disputed_at"),
    closedAt: ts("closed_at"),
    closedBy: text("closed_by"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("statements_uq").on(t.facilityId, t.period)],
);

/** 確定済みの月の入館を取り消した場合の調整行（翌月以降のマイナス行） */
export const settlementAdjustments = pgTable(
  "settlement_adjustments",
  {
    id: id(),
    facilityId: uuid("facility_id").notNull().references(() => facilities.id),
    period: text("period").notNull(),
    checkinId: uuid("checkin_id").references(() => checkins.id),
    amount: integer("amount").notNull(),
    reason: text("reason").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("settlement_adjustments_idx").on(t.facilityId, t.period)],
);

/** 施設から運営への取消申請（翌日以降の入館） */
export const cancelRequests = pgTable("cancel_requests", {
  id: id(),
  checkinId: uuid("checkin_id").notNull().references(() => checkins.id),
  requestedBy: uuid("requested_by").notNull(),
  reason: text("reason").notNull(),
  status: text("status", { enum: ["open", "approved", "rejected"] }).notNull().default("open"),
  resolvedBy: text("resolved_by"),
  resolvedAt: ts("resolved_at"),
  resolutionNote: text("resolution_note"),
  createdAt: createdAt(),
});

/** 施設からの料金・営業情報の変更申請 */
export const changeRequests = pgTable("change_requests", {
  id: id(),
  facilityId: uuid("facility_id").notNull().references(() => facilities.id),
  requestedBy: uuid("requested_by").notNull(),
  category: text("category").notNull(),
  body: text("body").notNull(),
  effectiveOn: day("effective_on"),
  status: text("status", { enum: ["open", "done", "rejected"] }).notNull().default("open"),
  resolvedBy: text("resolved_by"),
  resolvedAt: ts("resolved_at"),
  resolutionNote: text("resolution_note"),
  createdAt: createdAt(),
});

/* ───────── アカウントと認証 ───────── */

/** 運営・企業担当・施設担当のアカウント（会員とは別の認証） */
export const staffUsers = pgTable(
  "staff_users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash"),
    /** admin: 運営管理者 / operator: 運営担当（精算確定不可） / viewer: 閲覧のみ / company: 導入企業担当 / facility: 提携施設担当 */
    role: text("role", { enum: ["admin", "operator", "viewer", "company", "facility"] }).notNull(),
    companyId: uuid("company_id").references(() => companies.id),
    operatorId: uuid("operator_id").references(() => operators.id),
    /** 施設担当で特定の1店舗に限定する場合 */
    facilityId: uuid("facility_id").references(() => facilities.id),
    totpSecret: text("totp_secret"),
    totpEnabled: boolean("totp_enabled").notNull().default(false),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: ts("locked_until"),
    active: boolean("active").notNull().default(true),
    lastLoginAt: ts("last_login_at"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("staff_users_email_uq").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** トークンのSHA-256。生トークンは保存しない。 */
    id: text("id").primaryKey(),
    subjectKind: text("subject_kind", { enum: ["member", "staff"] }).notNull(),
    subjectId: uuid("subject_id").notNull(),
    deviceId: text("device_id").notNull().default(""),
    /** 2段階認証の入力待ち */
    mfaPending: boolean("mfa_pending").notNull().default(false),
    userAgent: text("user_agent").notNull().default(""),
    ip: text("ip").notNull().default(""),
    createdAt: createdAt(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    revokedAt: ts("revoked_at"),
  },
  (t) => [index("sessions_subject_idx").on(t.subjectKind, t.subjectId)],
);

/** 招待・パスワード再設定のワンタイムトークン */
export const authTokens = pgTable("auth_tokens", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["invite", "reset"] }).notNull(),
  subjectKind: text("subject_kind", { enum: ["member", "staff"] }).notNull(),
  subjectId: uuid("subject_id").notNull(),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
  createdAt: createdAt(),
});

/* ───────── お知らせ・メール・ログ ───────── */

export const notices = pgTable("notices", {
  id: id(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /** all: 全会員 / company: 特定企業の会員 / facility: 特定施設の利用者 */
  audience: text("audience", { enum: ["all", "company", "facility"] }).notNull().default("all"),
  companyId: uuid("company_id").references(() => companies.id),
  facilityId: uuid("facility_id").references(() => facilities.id),
  publishedAt: ts("published_at").notNull().defaultNow(),
  expiresAt: ts("expires_at"),
  createdBy: text("created_by").notNull(),
  createdAt: createdAt(),
});

export const outboxEmails = pgTable("outbox_emails", {
  id: id(),
  to: text("to").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  sentAt: ts("sent_at"),
  error: text("error"),
  createdAt: createdAt(),
});

/** CSV一括登録の下書き（プレビュー→反映） */
export const memberImports = pgTable("member_imports", {
  id: id(),
  companyId: uuid("company_id").notNull().references(() => companies.id),
  createdBy: text("created_by").notNull(),
  fileName: text("file_name").notNull().default(""),
  plan: jsonb("plan").notNull(),
  status: text("status", { enum: ["preview", "applied", "discarded"] }).notNull().default("preview"),
  appliedAt: ts("applied_at"),
  createdAt: createdAt(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorKind: text("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull().default(""),
    detail: jsonb("detail"),
    ip: text("ip").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);
