// 主要な更新操作を画面から実行して確かめる。
// 使い方: npm run db:reset → npm run dev → node tests/e2e/actions.mjs [スクリーンショットの保存先]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { generate } from "otplib";

const base = "http://localhost:3000";
const out = process.argv[2] ?? ".data/shots";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const results = [];
const errors = [];
const allPages = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(`PASS ${name}`);
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message.split("\n")[0]}`);
    let i = 0;
    for (const p of allPages) {
      if (p.isClosed()) continue;
      await p.screenshot({ path: path.join(out, `fail-${results.length}-${i++}.png`), fullPage: true }).catch(() => {});
    }
  }
};
const expectText = async (page, text, timeout = 30000) => {
  await page.getByText(text, { exact: false }).first().waitFor({ timeout });
};

async function newPage(viewport = { width: 1366, height: 900 }) {
  const ctx = await browser.newContext({ viewport, locale: "ja-JP" });
  const page = await ctx.newPage();
  allPages.push(page);
  page.on("pageerror", (e) => errors.push(`${page.url()} ${e.message}`));
  page.on("dialog", (d) => d.accept());
  return page;
}
async function login(page, email, url = "/staff/login") {
  await page.goto(base + url);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "yufuda2026");
  await Promise.all([page.waitForURL((u) => !u.pathname.includes("login")), page.click("button[type=submit]")]);
}
const submitIn = async (scope, label) => {
  await scope.getByRole("button", { name: label }).first().click();
};

const admin = await newPage();
await login(admin, "admin@example.com");
let companyUrl = "";
let inviteUrl = "";

await step("運営: 企業を登録", async () => {
  await admin.goto(base + "/admin/companies/new");
  await admin.fill("input[name=name]", "テスト物産株式会社");
  await admin.fill("input[name=contactName]", "総務 鈴木");
  await submitIn(admin, "登録して契約の設定へ");
  await admin.waitForURL(/\/admin\/companies\/[0-9a-f-]{36}/);
  companyUrl = admin.url().split("?")[0];
  await expectText(admin, "企業を登録しました");
});

await step("運営: 契約を追加", async () => {
  const form = admin.locator("form", { has: admin.locator("input[name=monthlyPoints]") });
  await form.locator("input[name=monthlyPoints]").fill("4000");
  await form.locator("input[name=feePerMember]").fill("2500");
  await submitIn(form, "契約を追加");
  await admin.waitForURL(/ok=contract/);
  await expectText(admin, "契約を追加しました");
});

await step("運営: 会員を登録し招待メールを送る", async () => {
  const companyId = companyUrl.split("/").pop();
  await admin.goto(`${base}/admin/members?company=${companyId}`);
  await admin.getByText("会員を1名登録する").click();
  const form = admin.locator("form", { has: admin.locator("input[name=employeeNo]") });
  await form.locator("input[name=employeeNo]").fill("T001");
  await form.locator("input[name=name]").fill("試験 一郎");
  await form.locator("input[name=email]").fill("ichiro@test-bussan.example");
  await submitIn(form, "登録する");
  await expectText(admin, "試験 一郎 さんを登録しました");
});

await step("運営: 送信記録から招待リンクを取得", async () => {
  await admin.goto(base + "/admin/outbox");
  await admin.getByText("ichiro@test-bussan.example").first().click();
  const text = await admin.locator("details[open] pre").first().innerText();
  inviteUrl = /http\S+\/invite\/[A-Za-z0-9_-]+/.exec(text)?.[0] ?? "";
  if (!inviteUrl) throw new Error("招待URLが見つからない");
});

await step("会員: 招待リンクからパスワード設定 → ガイド → 会員証にポイント", async () => {
  const m = await newPage({ width: 390, height: 844 });
  await m.goto(inviteUrl.replace(/^https?:\/\/[^/]+/, base));
  await expectText(m, "ようこそ、試験 一郎 さん");
  await m.fill("input[name=password]", "abcd1234");
  await m.fill("input[name=confirm]", "abcd1234");
  await submitIn(m, "会員証をつくる");
  await m.waitForURL(/\/m\/guide/);
  await m.goto(base + "/m");
  await expectText(m, "4,000");
  await m.screenshot({ path: path.join(out, "e01-new-member-card.png"), fullPage: true });
  await m.context().close();
});

await step("企業: CSV一括登録（プレビュー→反映）", async () => {
  const c = await newPage();
  await login(c, "hr@sample-shoji.example");
  const csvPath = path.join(out, "import.csv");
  fs.writeFileSync(
    csvPath,
    "﻿社員番号,氏名,フリガナ,メールアドレス,部署,利用開始日,利用停止日\r\nA1002,鈴木 一郎,スズキ イチロウ,suzuki@sample-shoji.example,営業部,,2026/12/31\r\nA2001,新入 花子,シンニュウ ハナコ,shinnyu@sample-shoji.example,総務部,2026/10/01,\r\nA2002,間違 太郎,,bad-email,総務部,,\r\n",
  );
  await c.goto(base + "/company/import");
  await c.setInputFiles("input[name=file]", csvPath);
  await submitIn(c, "内容を確認する");
  await c.waitForURL(/id=/);
  await c.screenshot({ path: path.join(out, "e02-import-preview.png"), fullPage: true });
  await expectText(c, "メールアドレスの形式が正しくありません");
  await submitIn(c, "件を反映する");
  await c.waitForURL(/\/company\/members/);
  await expectText(c, "CSVを反映しました");
  await expectText(c, "新入 花子");
  await c.context().close();
});

await step("会員: 入館（デモ会員）", async () => {
  const m = await newPage({ width: 390, height: 844 });
  await login(m, "suzuki@sample-shoji.example", "/login");
  // 施設担当（ゆけむり商会）が扱う店舗で入館する
  await m.goto(base + "/q/demo-minato-front");
  await m.locator(".ken").first().click();
  await m.focus(".slide-knob");
  await m.keyboard.press("Enter");
  await m.waitForURL(/\/m\/pass\//, { timeout: 15000 });
  await expectText(m, "入館済み");
  await m.context().close();
});

await step("施設: 本日の入館を取り消す", async () => {
  const f = await newPage();
  await login(f, "front@yukemuri.example");
  await f.goto(base + "/facility");
  // 入館がある店舗に切り替える
  const hrefs = await f.locator("nav.tabs a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  for (const h of hrefs) {
    if (await f.getByText("鈴木 様").count()) break;
    await f.goto(base + h, { waitUntil: "networkidle" });
  }
  if (!(await f.getByText("鈴木 様").count())) throw new Error("本日の入館が施設画面に表示されない");
  await f.locator("summary", { hasText: "取消" }).first().click();
  await f.locator("input[name=reason]").first().fill("テスト取消");
  await submitIn(f, "取り消す");
  await expectText(f, "入館を取り消しました");
  await f.context().close();
});

await step("運営: 前月の精算を確認依頼 → 施設が確認 → 確定 → 支払通知書", async () => {
  await admin.goto(base + "/admin/settlements");
  const boxes = admin.locator("input[name=statementId]");
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await submitIn(admin, "選んだ施設に確認依頼");
  await expectText(admin, "件を確認依頼しました");
  const f = await newPage();
  await login(f, "front@yukemuri.example");
  await f.goto(base + "/facility/settlements", { waitUntil: "networkidle" });
  const firstReview = f.locator("tr", { hasText: "要確認" }).locator("a").first();
  await Promise.all([f.waitForURL(/\/facility\/settlements\/[0-9a-f-]{36}/, { timeout: 60000 }), firstReview.click({ timeout: 60000 })]);
  if (await f.getByRole("button", { name: "確認済みにする" }).count()) {
    await submitIn(f, "確認済みにする");
    await expectText(f, "確認済みにしました");
  }
  const stUrl = f.url();
  await f.context().close();
  await admin.goto(base + "/admin/settlements/" + stUrl.split("/").pop());
  await submitIn(admin, "確定する");
  await expectText(admin, "が確定しました");
  await admin.goto(base + "/print/statement/" + stUrl.split("/").pop());
  await expectText(admin, "支払通知書");
  await admin.screenshot({ path: path.join(out, "e03-payment-notice.png"), fullPage: true });
});

await step("運営: 施設に料金改定・追加料金・QR再発行", async () => {
  await admin.goto(base + "/admin/facilities");
  await Promise.all([admin.waitForURL(/\/admin\/facilities\/[0-9a-f-]{36}/), admin.locator("table a").first().click()]);
  const url = admin.url().split("?")[0];
  await admin.goto(url + "?tab=courses");
  const priceForm = admin.locator("form", { has: admin.locator("input[name=listPrice]") }).first();
  await priceForm.locator("input[name=points]").fill("1300");
  await priceForm.locator("input[name=listPrice]").fill("1450");
  await submitIn(priceForm, "料金を登録");
  await expectText(admin, "からの料金を登録しました");
  await admin.goto(url + "?tab=surcharges");
  await admin.getByText("追加料金を追加").click();
  const sf = admin.locator("details[open] form").last();
  await sf.locator("input[name=label]").fill("年末年始料金");
  await sf.locator("input[name=amount]").fill("500");
  await sf.locator("input[name=onSpecialDay]").check();
  await submitIn(sf, "追加");
  await expectText(admin, "追加料金を保存しました");
  await admin.goto(url + "?tab=qr");
  await submitIn(admin, "再発行");
  await expectText(admin, "新しいQRコードを発行しました");
});

await step("運営: お知らせ・祝日・設定・定期処理", async () => {
  await admin.goto(base + "/admin/notices");
  await admin.fill("input[name=title]", "テストのお知らせ");
  await admin.fill("textarea[name=body]", "本文です");
  await submitIn(admin, "登録");
  await expectText(admin, "お知らせを登録しました");
  await admin.goto(base + "/admin/calendar");
  await admin.locator("form", { has: admin.locator("input[name=name]") }).locator("input[name=date]").fill("2026-11-30");
  await admin.locator("form", { has: admin.locator("input[name=name]") }).locator("input[name=name]").fill("テスト休日");
  await submitIn(admin.locator("form", { has: admin.locator("input[name=name]") }), "追加");
  await expectText(admin, "祝日を更新しました");
  await admin.goto(base + "/admin/settings");
  await submitIn(admin, "保存");
  await expectText(admin, "設定を保存しました");
  await admin.goto(base + "/admin/monthly");
  await submitIn(admin, "今すぐ実行する");
  await expectText(admin, "実行しました");
});

await step("担当者: 2段階認証を設定して再ログイン", async () => {
  const p = await newPage();
  await login(p, "ops@example.com");
  await p.goto(base + "/staff/2fa-setup");
  await submitIn(p, "設定をはじめる");
  await p.waitForURL(/2fa-setup/);
  const secret = (await p.locator("code").innerText()).trim();
  await p.fill("input[name=code]", await generate({ secret }));
  await submitIn(p, "設定を完了する");
  await p.waitForURL(/\/admin/);
  await p.context().clearCookies();
  await p.goto(base + "/staff/login");
  await p.fill("input[name=email]", "ops@example.com");
  await p.fill("input[name=password]", "yufuda2026");
  await submitIn(p, "ログイン");
  await p.waitForURL(/\/staff\/mfa/);
  await p.fill("input[name=code]", await generate({ secret }));
  await submitIn(p, "確認");
  await p.waitForURL(/\/admin/);
  // 運営担当は確定できない
  await p.goto(base + "/admin/settings");
  await expectText(p, "設定の変更は運営管理者のみ行えます");
  await p.context().close();
});

await step("権限: 閲覧外の画面とAPI", async () => {
  const c = await newPage();
  await login(c, "soumu@mirai-kogyo.example");
  const other = await c.request.get(base + "/api/csv/company?kind=members&company=00000000-0000-0000-0000-000000000000");
  const body = await other.text();
  if (body.includes("suzuki@sample-shoji")) throw new Error("他社の会員が見えた");
  const r = await c.request.get(base + "/api/csv/report?kind=company", { maxRedirects: 0 });
  if (r.status() === 200 && (await r.text()).includes("企業別")) throw new Error("企業担当が全社集計を取得できた");
  const cron = await c.request.post(base + "/api/cron/monthly");
  if (cron.status() !== 401) throw new Error("cronが認証なしで動いた");
  const ck = await c.request.post(base + "/api/checkin", { data: {}, headers: { origin: "https://evil.example" } });
  if (ck.status() !== 403) throw new Error(`他サイトからの入館APIが拒否されない (${ck.status()})`);
  await c.context().close();
});

console.log(results.join("\n"));
console.log(errors.length ? `PAGE ERRORS:\n${errors.join("\n")}` : "no page errors");
await browser.close();
