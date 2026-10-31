// Runs in GitHub Actions only: loads the built page in Chromium and checks it renders at phone and desktop width.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

mkdirSync("shots", { recursive: true });
const browser = await chromium.launch();
for (const [name, width, height] of [["phone", 375, 800], ["desktop", 1280, 900]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:8080/");
  await page.waitForSelector("#groups .item");
  const before = await page.locator("#groups .item").count();
  await page.uncheck("#fits");
  assert.ok(await page.locator("#groups .item").count() > before, "turning off the schedule filter shows more");
  await page.check("#fits");
  await page.click('.lg[data-cat="Swim"]');
  assert.equal(await page.locator('#groups .item[data-c="swim"]').count(), 0, "swim chip hides swim classes");
  await page.click('.lg[data-cat="Swim"]');
  assert.ok(await page.locator("#providers .item").count() > 5, "providers render");
  await page.click("#theme");
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
  await page.screenshot({ path: `shots/${name}-dark.png` });
  await page.click("#theme");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(overflow, 0, `${name} has horizontal scroll`);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: `shots/${name}.png` });
  await page.close();
}
await browser.close();
console.log("page check passed");
