import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { filterItems, fitsAge, fitsSchedule, formatDateTime, formatTime, groupItems, isNew, liveStatus, placeOf, placeOptions } from "../docs/logic.mjs";

const NOW = "2026-11-03 12:31:00";
const item = (o = {}) => ({
  name: "Class", provider: "P", location: "L", category: "Swim", days: ["Sat"], startTime: "10:00",
  firstDate: "2026-11-14", status: "open", miles: 2, firstSeen: "2026-10-30 12:00:00", ...o,
});
const off = { fitsOnly: false, showDropIn: true, showAnytime: true, place: "", neighborhood: "", age: null, hidden: new Set(), startsFrom: "", maxMiles: 0, search: "" };

test("schedule fit means a weekend or a 5:30pm or later start", () => {
  assert.equal(fitsSchedule(item()), true);
  assert.equal(fitsSchedule(item({ days: ["Mon"], startTime: "17:30" })), true);
  assert.equal(fitsSchedule(item({ days: ["Mon"], startTime: "17:29" })), false);
  assert.equal(fitsSchedule(item({ days: ["Mon"], startTime: "" })), false);
});

test("a class flips to open as soon as its registration time passes", () => {
  assert.equal(liveStatus(item({ status: "upcoming", opensAt: "2026-11-03 12:30:00" }), NOW), "open");
  assert.equal(liveStatus(item({ status: "upcoming", opensAt: "2026-11-03 12:32:00" }), NOW), "upcoming");
});

test("filters combine, and unknown distances stay visible", () => {
  const items = [item({ name: "A" }), item({ name: "B", miles: 12 }), item({ name: "C", miles: null, category: "Dance" })];
  assert.equal(filterItems(items, off, NOW).length, 3);
  assert.deepEqual(filterItems(items, { ...off, maxMiles: 5 }, NOW).map((i) => i.name), ["A", "C"]);
  assert.deepEqual(filterItems(items, { ...off, hidden: new Set(["Swim"]) }, NOW).map((i) => i.name), ["C"]);
  assert.deepEqual(filterItems(items, { ...off, search: "b" }, NOW).map((i) => i.name), ["B"]);
});

test("only future sessions show, and drop-ins need opting in", () => {
  const started = item({ name: "started", firstDate: "2026-11-03" });
  const winter = item({ name: "winter", firstDate: "2027-01-16" });
  const drop = item({ name: "drop", status: "drop-in", firstDate: "2026-11-03" });
  const names = (f) => filterItems([started, winter, drop], f, NOW).map((i) => i.name);
  assert.deepEqual(names(off), ["winter", "drop"]);
  assert.deepEqual(names({ ...off, showDropIn: false }), ["winter"]);
  assert.deepEqual(names({ ...off, startsFrom: "2027-01-01", showDropIn: false }), ["winter"]);
  assert.deepEqual(filterItems([item({ firstDate: "2026-12-01" })], { ...off, startsFrom: "2027-01-01" }, NOW), []);
});

test("places filter by rec center or company, and join-anytime classes can be hidden", () => {
  const rec = item({ name: "rec", source: "rec", location: "Schiller Park", provider: "Columbus Rec & Parks" });
  const gym = item({ name: "gym", source: "jackrabbit", location: "Wendy's Gymnastics", provider: "Wendy's Gymnastics", status: "anytime", firstDate: "2026-08-31" });
  assert.equal(placeOf(rec), "Schiller Park");
  assert.equal(placeOf(gym), "Wendy's Gymnastics");
  assert.deepEqual(filterItems([rec, gym], { ...off, place: "Schiller Park" }, NOW).map((i) => i.name), ["rec"]);
  assert.deepEqual(filterItems([rec, gym], { ...off, place: "Wendy's Gymnastics" }, NOW).map((i) => i.name), ["gym"]);
  assert.deepEqual(filterItems([rec, gym], { ...off, showAnytime: false }, NOW).map((i) => i.name), ["rec"]);
  assert.deepEqual(placeOptions([rec, gym], [{ provider: "BalletMet" }]), { centers: ["Schiller Park"], companies: ["BalletMet", "Wendy's Gymnastics"] });
});

test("age matches any overlap with that year of age", () => {
  const fourToFive = item({ ageMin: 48, ageMax: 72 });
  assert.equal(fitsAge(fourToFive, 3), false);
  assert.equal(fitsAge(fourToFive, 4), true);
  assert.equal(fitsAge(fourToFive, 5), true);
  assert.equal(fitsAge(fourToFive, 6), false);
  assert.equal(fitsAge(item({ ageMin: 54, ageMax: 84 }), 4), true);
  assert.equal(fitsAge(item({ ageMin: 36, ageMax: null }), 6), true);
  assert.deepEqual(filterItems([fourToFive], { ...off, age: 6 }, NOW), []);
});

test("neighborhood narrows the list", () => {
  const items = [item({ name: "a", neighborhood: "Bexley" }), item({ name: "b", neighborhood: "Grandview" })];
  assert.deepEqual(filterItems(items, { ...off, neighborhood: "Grandview" }, NOW).map((i) => i.name), ["b"]);
});

test("groups put nearest first and earliest registration first", () => {
  const groups = groupItems([
    item({ name: "far", miles: 9 }), item({ name: "near", miles: 1 }),
    item({ name: "later", status: "upcoming", opensAt: "2027-01-05 12:30:00" }),
    item({ name: "sooner", status: "upcoming", opensAt: "2026-11-24 12:30:00" }),
  ], NOW);
  assert.deepEqual(groups[0].items.map((i) => i.name), ["near", "far"]);
  assert.deepEqual(groups[1].items.map((i) => i.name), ["sooner", "later"]);
});

test("new means after the baseline and within two weeks", () => {
  const base = "2026-10-30 12:00:00";
  assert.equal(isNew(item({ firstSeen: base }), base, NOW), false);
  assert.equal(isNew(item({ firstSeen: "2026-11-01 09:00:00" }), base, NOW), true);
  assert.equal(isNew(item({ firstSeen: "2026-11-01 09:00:00" }), base, "2026-12-01 09:00:00"), false);
});

test("formatting", () => {
  assert.equal(formatTime("17:45"), "5:45pm");
  assert.equal(formatTime("00:05"), "12:05am");
  assert.equal(formatDateTime("2026-11-03 12:30:00"), "Tue, Nov 3 at 12:30pm");
});

test("no excluded provider appears in the curated list", () => {
  const raw = readFileSync("data/providers.json", "utf8");
  assert.doesNotMatch(raw, /goldfish/i);
});

test("saving a listing keeps its name and link, and saving it again forgets it", async () => {
  const { readSaved, toggleSaved } = await import("../docs/logic.mjs");
  const swim = { id: "rec-1", name: "Tadpoles", url: "https://example.org/1", provider: "Rec" };
  const once = toggleSaved({}, "item", swim, NOW);
  assert.deepEqual(once, { "item:rec-1": { name: "Tadpoles", url: "https://example.org/1", provider: "Rec", savedAt: NOW } });
  assert.deepEqual(toggleSaved(once, "item", swim, NOW), {});
  assert.deepEqual(toggleSaved(once, "provider", { ...swim }, NOW)["provider:rec-1"].name, "Tadpoles", "a provider with the same id is its own entry");
  assert.deepEqual(readSaved(JSON.stringify(once)), once, "it reads back as it was written");
});

test("saved listings read from storage are checked, and anything odd is dropped", async () => {
  const { readSaved } = await import("../docs/logic.mjs");
  assert.deepEqual(readSaved(null), {});
  assert.deepEqual(readSaved("not json"), {});
  assert.deepEqual(readSaved("[1,2]"), {});
  const kept = readSaved(JSON.stringify({
    "item:a": { name: "A", url: "https://x.org/a" },
    "item:b": { name: "B", url: "javascript:alert(1)" },
    "other:c": { name: "C", url: "https://x.org/c" },
    "item:d": { url: "https://x.org/d" },
  }));
  assert.deepEqual(Object.keys(kept), ["item:a"]);
  assert.deepEqual(kept["item:a"], { name: "A", url: "https://x.org/a", provider: "", savedAt: "" });
});

test("the saved section shows listings still on the site, newest first, and keeps the rest as links", async () => {
  const { savedView } = await import("../docs/logic.mjs");
  const items = [item({ id: "a", name: "A" }), item({ id: "b", name: "B" })];
  const providers = [{ id: "p", name: "Studio" }];
  const saved = {
    "item:a": { name: "A", url: "https://x.org/a", provider: "", savedAt: "2026-11-01 10:00:00" },
    "item:b": { name: "B", url: "https://x.org/b", provider: "", savedAt: "2026-11-02 10:00:00" },
    "provider:p": { name: "Studio", url: "https://x.org/p", provider: "", savedAt: "2026-11-01 09:00:00" },
    "item:gone": { name: "Old", url: "https://x.org/old", provider: "Rec", savedAt: "2026-10-01 09:00:00" },
  };
  const view = savedView(saved, items, providers);
  assert.deepEqual(view.items.map((i) => i.name), ["B", "A"]);
  assert.deepEqual(view.providers.map((p) => p.name), ["Studio"]);
  assert.deepEqual(view.gone, [{ key: "item:gone", name: "Old", url: "https://x.org/old", provider: "Rec", savedAt: "2026-10-01 09:00:00" }]);
});
