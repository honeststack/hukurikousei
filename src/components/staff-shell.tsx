import Link from "next/link";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { CurrentStaff } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/scope";
import { staffLogoutAction } from "@/app/staff/actions";
import { Suspense } from "react";
import { Flash } from "./flash";
import { SideNav, type NavGroup } from "./side-nav";

async function navFor(u: CurrentStaff): Promise<{ groups: NavGroup[]; subtitle: string }> {
  const db = await getDb();
  if (u.role === "company") {
    const [c] = await db.select({ name: schema.companies.name }).from(schema.companies).where(eq(schema.companies.id, u.companyId!));
    return {
      subtitle: c?.name ?? "導入企業",
      groups: [
        {
          items: [
            { href: "/company", label: "トップ", exact: true },
            { href: "/company/members", label: "会員" },
            { href: "/company/import", label: "CSV一括登録" },
            { href: "/company/usage", label: "利用状況" },
            { href: "/company/billing", label: "請求明細" },
            { href: "/company/kit", label: "社内周知キット" },
          ],
        },
      ],
    };
  }
  if (u.role === "facility") {
    const [o] = u.operatorId ? await db.select({ name: schema.operators.name }).from(schema.operators).where(eq(schema.operators.id, u.operatorId)) : [];
    return {
      subtitle: o?.name ?? "提携施設",
      groups: [
        {
          items: [
            { href: "/facility", label: "本日の入館", exact: true },
            { href: "/facility/history", label: "入館の履歴" },
            { href: "/facility/settlements", label: "月次精算" },
            { href: "/facility/qr", label: "QR掲示物" },
            { href: "/facility/requests", label: "変更・取消の申請" },
          ],
        },
      ],
    };
  }
  const [flags] = await db
    .select({ n: count() })
    .from(schema.checkins)
    .where(and(sql`jsonb_array_length(${schema.checkins.flags}) > 0`, isNull(schema.checkins.flagsResolvedAt)));
  const [cr] = await db.select({ n: count() }).from(schema.cancelRequests).where(eq(schema.cancelRequests.status, "open"));
  const [ch] = await db.select({ n: count() }).from(schema.changeRequests).where(eq(schema.changeRequests.status, "open"));
  const [disputes] = await db
    .select({ n: count() })
    .from(schema.statements)
    .where(and(eq(schema.statements.status, "review"), sql`${schema.statements.disputedAt} is not null`, isNull(schema.statements.facilityConfirmedAt)));
  return {
    subtitle: "運営",
    groups: [
      {
        title: "日々の業務",
        items: [
          { href: "/admin", label: "トップ", exact: true },
          { href: "/admin/checkins", label: "入館記録" },
          { href: "/admin/flags", label: "要確認の入館", badge: Number(flags?.n ?? 0) },
          { href: "/admin/requests", label: "施設からの申請", badge: Number(cr?.n ?? 0) + Number(ch?.n ?? 0) },
        ],
      },
      {
        title: "精算と集計",
        items: [
          { href: "/admin/settlements", label: "月次精算", badge: Number(disputes?.n ?? 0) },
          { href: "/admin/reports", label: "月次集計" },
          { href: "/admin/monthly", label: "定期処理" },
        ],
      },
      {
        title: "登録情報",
        items: [
          { href: "/admin/companies", label: "導入企業" },
          { href: "/admin/members", label: "会員" },
          { href: "/admin/facilities", label: "提携施設" },
          { href: "/admin/operators", label: "施設の運営会社" },
          { href: "/admin/calendar", label: "祝日・特別料金日" },
          { href: "/admin/notices", label: "お知らせ" },
        ],
      },
      {
        title: "システム",
        items: [
          { href: "/admin/users", label: "担当者アカウント" },
          { href: "/admin/audit", label: "操作ログ" },
          { href: "/admin/outbox", label: "メール送信記録" },
          { href: "/admin/settings", label: "設定" },
        ],
      },
    ],
  };
}

export async function StaffShell({
  user,
  title,
  crumbs,
  actions,
  children,
}: {
  user: CurrentStaff;
  title: string;
  crumbs?: { href: string; label: string }[];
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { groups, subtitle } = await navFor(user);
  return (
    <div className="s-shell">
      <aside className="s-side">
        <Link href="/staff" className="s-brand">
          <span className="s-brand-mark">湯札</span>
          <span className="s-brand-text">
            湯札 管理
            <small>{subtitle}</small>
          </span>
        </Link>
        <SideNav groups={groups} />
        <div className="s-user">
          <div>{user.name}</div>
          <div style={{ opacity: 0.7 }}>{ROLE_LABEL[user.role]}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            <Link href="/staff/account">アカウント</Link>
            <form action={staffLogoutAction}>
              <button type="submit" className="btn-link" style={{ color: "inherit", font: "inherit", cursor: "pointer" }}>
                ログアウト
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="s-main">
        <header className="s-head">
          <div>
            {crumbs && (
              <div className="crumbs">
                {crumbs.map((c, i) => (
                  <span key={c.href}>
                    {i > 0 && " › "}
                    <Link href={c.href}>{c.label}</Link>
                  </span>
                ))}
              </div>
            )}
            <h1>{title}</h1>
          </div>
          {actions && <div className="s-actions">{actions}</div>}
        </header>
        <Suspense fallback={null}>
          <Flash />
        </Suspense>
        {children}
      </main>
    </div>
  );
}
