// 会員の入館の流れ（ログイン→コース選択→スライド→入館証）を撮影する。
// 使い方: node tests/e2e/member.mjs [スクリーンショットの保存先]
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const out = process.argv[2] ?? ".data/shots";
fs.mkdirSync(out, { recursive: true });
const base = "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: "ja-JP" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const shot = async (name, full = true) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: full });
};

await page.goto(`${base}/q/demo-minato-front`);
await shot("m00-login");
await page.fill("input[name=email]", "demo@example.com");
await page.fill("input[name=password]", "yufuda2026");
await page.click("button[type=submit]");
await page.waitForURL(/\/q\//);
await shot("m02-courses");
await page.click(".ken >> nth=1");
await shot("m03-sheet", false);
await page.focus(".slide-knob");
await page.keyboard.press("Enter");
await page.waitForURL(/\/m\/pass\//, { timeout: 15000 });
await shot("m04-pass");
await page.goto(`${base}/m`);
await shot("m01-card");
await page.goto(`${base}/m/history`);
await shot("m05-history");
await page.goto(`${base}/m/facilities`);
await shot("m06-facilities");
await page.goto(`${base}/m/scan`);
await shot("m07-scan", false);
console.log("errors:", JSON.stringify(errors, null, 1));
await browser.close();
