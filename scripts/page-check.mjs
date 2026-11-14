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
  // Which categories, areas and places there are changes with the data, so the checks pick from what is there.
  const chip = page.locator(".lg").first(), cat = await chip.getAttribute("data-c");
  await chip.click();
  assert.equal(await page.locator(`#groups .item[data-c="${cat}"]`).count(), 0, "a category's chip hides its classes");
  await chip.click();
  await page.click("#noTags");
  assert.equal(await page.locator("#groups .item").count(), 0, "None hides every tag");
  await page.click("#allTags");
  assert.equal(await page.locator("#groups .item").count(), before, "All restores every tag");
  await page.selectOption("#starts", "2027-01-01");
  assert.ok(await page.locator("#groups .item").count() > 0, "winter classes show");
  await page.selectOption("#starts", "");
  await page.selectOption("#age", "2");
  assert.ok(await page.locator("#groups .item").count() < before, "the age filter narrows the list");
  assert.ok(await page.locator("#camps .item").count() > 0, "camp cards render");
  await page.selectOption("#age", "");
  // The area and the company of the first class shown, so each filter has something to keep and something to drop.
  await page.uncheck("#fits");
  const all = await page.locator("#groups .item").count();
  const { area, company } = await page.evaluate(async () => {
    const data = await (await fetch("data.json")).json();
    const names = new Set([...document.querySelectorAll("#groups .item h3")].map((h) => h.textContent));
    const shown = data.items.filter((i) => names.has(i.name));
    return { area: shown[0].neighborhood, company: (shown.find((i) => i.source !== "rec") ?? shown[0]).provider };
  });
  await page.selectOption("#neighborhood", area);
  const inArea = await page.locator("#groups .item").count();
  assert.ok(inArea > 0 && inArea < all, `neighborhood filter narrows to ${area}`);
  await page.selectOption("#neighborhood", "");
  await page.selectOption("#place", company);
  assert.ok(await page.locator("#groups .item").count() > 0, `place filter shows ${company}`);
  assert.equal(await page.locator("#groups .item").filter({ hasNotText: company }).count(), 0, "place filter hides others");
  await page.check("#fits");
  await page.selectOption("#place", "");
  assert.equal(await page.locator('#groups .mk:has-text("Full")').count(), 0, "full classes never show");
  assert.ok(await page.locator("#providers .item").count() > 5, "providers render");

  // Saving: a class and a provider go in Saved, stay after a reload, and leave when unsaved.
  await page.evaluate(() => localStorage.removeItem("saved"));
  await page.reload();
  await page.waitForSelector("#groups .item");
  assert.ok(await page.locator("#saved").isHidden(), "nothing saved, no Saved section");
  const first = page.locator("#groups .item").first();
  const name = await first.locator("h3").innerText();
  await first.locator(".star").click();
  assert.equal(await page.locator("#saved-list .item").count(), 1, "the saved class shows in Saved");
  assert.equal(await page.locator("#saved-list h3").innerText(), name);
  assert.equal(await page.locator(`#groups .star[aria-pressed="true"]`).count(), 1, "its star in the list is lit");
  await page.locator("#providers .item .star").first().click();
  assert.equal(await page.locator("#saved-list .item").count(), 2, "a provider can be saved too");
  await page.selectOption("#age", "1");
  await page.fill("#search", "zzzz no such class");
  assert.equal(await page.locator("#saved-list .item").count(), 2, "Saved ignores the filters");
  await page.fill("#search", "");
  await page.selectOption("#age", "");
  await page.reload();
  await page.waitForSelector("#groups .item");
  assert.equal(await page.locator("#saved-list .item").count(), 2, "saved listings survive a reload");
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("saved")); s["item:gone-away"] = { name: "Old class", url: "https://example.org/old", provider: "Rec", savedAt: "2026-01-01 00:00:00" }; localStorage.setItem("saved", JSON.stringify(s)); });
  await page.reload();
  await page.waitForSelector("#groups .item");
  assert.equal(await page.locator('#saved-gone li:has-text("No longer listed")').count(), 1, "a listing gone from the site stays as a link");
  for (const button of await page.locator("#saved .star").all()) await page.locator("#saved .star").first().click();
  assert.ok(await page.locator("#saved").isHidden(), "unsaving everything hides Saved");
  assert.equal(await page.evaluate(() => localStorage.getItem("saved")), "{}");
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
