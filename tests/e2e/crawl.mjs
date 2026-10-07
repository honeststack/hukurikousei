// 全画面を巡回し、エラー表示・権限漏れ・CSVの取得失敗を検出する。
// 使い方: npm run dev（またはnpm start）→ node tests/e2e/crawl.mjs [スクリーンショットの保存先]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2] ?? ".data/shots";
fs.mkdirSync(out, { recursive: true });
const only = process.argv[3]; // admin|company|facility|member
const base = "http://localhost:3000";
const browser = await chromium.launch();
const problems = [];

async function session(email, password, loginPath, viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "ja-JP", acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => problems.push(`[pageerror] ${page.url()} ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Download the React DevTools|favicon/.test(m.text())) problems.push(`[console] ${page.url()} ${m.text().slice(0, 300)}`);
  });
  await page.goto(base + loginPath);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", password);
  await Promise.all([page.waitForURL((u) => !u.pathname.includes("login"), { timeout: 30000 }), page.click("button[type=submit]")]);
  return { ctx, page };
}

async function visit(page, url, name, full = true) {
  const res = await page.goto(base + url, { waitUntil: "networkidle" }).catch((e) => ({ status: () => `ERR ${e.message}` }));
  const status = res?.status?.();
  const body = await page.innerText("body").catch(() => "");
  if (status !== 200) problems.push(`[status ${status}] ${url}`);
  if (/Unhandled Runtime Error|Application error|Internal Server Error|This page could not be found/.test(body)) problems.push(`[error-page] ${url}`);
  if (name) await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: full });
  return page;
}

async function links(page, selector) {
  return page.$$eval(selector, (as) => [...new Set(as.map((a) => new URL(a.href).pathname + new URL(a.href).search))]);
}

if (!only || only === "admin") {
  const { page } = await session("admin@example.com", "yufuda2026", "/staff/login");
  const pages = [
    ["/admin", "a01-home"],
    ["/admin/checkins", "a02-checkins"],
    ["/admin/flags", "a03-flags"],
    ["/admin/requests", "a04-requests"],
    ["/admin/settlements", "a05-settlements"],
    ["/admin/reports", "a06-reports"],
    ["/admin/monthly", "a07-monthly"],
    ["/admin/companies", "a08-companies"],
    ["/admin/companies/new", null],
    ["/admin/members", "a09-members"],
    ["/admin/members/import", null],
    ["/admin/facilities", "a10-facilities"],
    ["/admin/facilities/new", null],
    ["/admin/operators", "a11-operators"],
    ["/admin/calendar", "a12-calendar"],
    ["/admin/notices", "a13-notices"],
    ["/admin/users", "a14-users"],
    ["/admin/audit", "a15-audit"],
    ["/admin/outbox", null],
    ["/admin/settings", "a16-settings"],
    ["/staff/account", null],
  ];
  for (const [u, n] of pages) await visit(page, u, n);
  await visit(page, "/admin/companies", null);
  for (const l of (await links(page, "table a[href^='/admin/companies/']")).slice(0, 2)) await visit(page, l, l.endsWith("") ? "a17-company" : null);
  await visit(page, "/admin/members", null);
  for (const l of (await links(page, "table a[href^='/admin/members/']")).slice(0, 2)) await visit(page, l, "a18-member");
  await visit(page, "/admin/checkins", null);
  for (const l of (await links(page, "table a[href^='/admin/checkins/']")).slice(0, 2)) await visit(page, l, "a19-checkin");
  await visit(page, "/admin/settlements", null);
  for (const l of (await links(page, "table a[href^='/admin/settlements/']")).slice(0, 2)) await visit(page, l, "a20-statement");
  await visit(page, "/admin/facilities", null);
  const fac = (await links(page, "table a[href^='/admin/facilities/']"))[0];
  for (const t of ["basic", "courses", "surcharges", "terms", "qr", "calendar"]) await visit(page, `${fac}?tab=${t}`, `a21-fac-${t}`);
  await visit(page, `${fac}?tab=surcharges&simDate=2026-12-30&simTime=2:00`, "a22-sim");
  const qrLinks = await links(page, "a[href^='/print/qr/']");
  await visit(page, `${fac}?tab=qr`, null);
  const q2 = await links(page, "a[href^='/print/qr/']");
  if (q2[0]) {
    await visit(page, q2[0], "p01-poster");
    await visit(page, q2[1] ?? q2[0], "p02-pop");
  }
  await visit(page, `/print/staff-guide/${fac.split("/").pop().split("?")[0]}`, "p03-guide");
  for (const csv of ["/api/csv/report?kind=company", "/api/csv/report?kind=facility", "/api/csv/checkins", "/api/csv/template"]) {
    const r = await page.request.get(base + csv);
    if (r.status() !== 200) problems.push(`[csv ${r.status()}] ${csv}`);
  }
  void qrLinks;
}

if (!only || only === "company") {
  const { page } = await session("hr@sample-shoji.example", "yufuda2026", "/staff/login");
  for (const [u, n] of [
    ["/company", "c01-home"],
    ["/company/members", "c02-members"],
    ["/company/import", "c03-import"],
    ["/company/usage", "c04-usage"],
    ["/company/billing", "c05-billing"],
    ["/company/kit", "c06-kit"],
  ])
    await visit(page, u, n);
  await visit(page, "/company/members", null);
  for (const l of (await links(page, "table a[href^='/company/members/']")).slice(0, 1)) await visit(page, l, "c07-member");
  const kit = await links(page, "a[href^='/print/kit/']");
  await visit(page, "/company/kit", null);
  for (const l of await links(page, "a[href^='/print/kit/']")) await visit(page, l, "p04-kit");
  // 他社の会員は見えない
  await visit(page, "/admin", null);
  if (!page.url().includes("/company")) problems.push(`[authz] company user reached ${page.url()}`);
  for (const csv of ["/api/csv/company?kind=members", "/api/csv/company?kind=usage", "/api/csv/company?kind=billing"]) {
    const r = await page.request.get(base + csv);
    if (r.status() !== 200) problems.push(`[csv ${r.status()}] ${csv}`);
  }
  void kit;
}

if (!only || only === "facility") {
  const { page } = await session("front@yukemuri.example", "yufuda2026", "/staff/login");
  for (const [u, n] of [
    ["/facility", "f01-today"],
    ["/facility/history", "f02-history"],
    ["/facility/settlements", "f03-settlements"],
    ["/facility/qr", "f04-qr"],
    ["/facility/requests", "f05-requests"],
  ])
    await visit(page, u, n);
  await visit(page, "/facility/settlements", null);
  for (const l of (await links(page, "table a[href^='/facility/settlements/']")).slice(0, 2)) await visit(page, l, "f06-statement");
  await visit(page, "/admin", null);
  if (!page.url().includes("/facility")) problems.push(`[authz] facility user reached ${page.url()}`);
  await visit(page, "/company", null);
  if (!page.url().includes("/facility")) problems.push(`[authz] facility user reached ${page.url()}`);
}

console.log(problems.length ? problems.join("\n") : "NO PROBLEMS");
await browser.close();
