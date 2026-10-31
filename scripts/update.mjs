// Refreshes docs/data.json. One failing source keeps its last good data and is reported on the page.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ANCHOR, hasStarted, http, localNow, milesBetween } from "./lib.mjs";
import { fetchBexley } from "./sources/bexley.mjs";
import { fetchCct } from "./sources/cct.mjs";
import { fetchJackrabbit } from "./sources/jackrabbit.mjs";
import { fetchLibrary } from "./sources/library.mjs";
import { fetchRec } from "./sources/rec.mjs";
import { fetchRecdesk } from "./sources/recdesk.mjs";
import { checkProviders } from "./sources/watch.mjs";

const read = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
const DATA = "docs/data.json", STATE = "data/state.json", GEO = "data/geocache.json";

const now = localNow();
const ctx = { now };
const previous = read(DATA, { items: [], sources: {} });
const state = read(STATE, { baselineAt: null, seen: {}, watch: {} });
const geo = read(GEO, {});
const providers = read("data/providers.json", []);

const SOURCES = {
  rec: { label: "Columbus Rec & Parks", run: fetchRec },
  cct: { label: "Columbus Children's Theatre", run: fetchCct },
  bexley: { label: "Bexley Rec", run: fetchBexley },
  recdesk: { label: "Grandview Heights Rec", run: fetchRecdesk },
  jackrabbit: { label: "Wendy's and K Studio", run: fetchJackrabbit },
  library: { label: "Columbus Metropolitan Library", run: fetchLibrary },
};

const items = [];
const sources = {};
for (const [key, { label, run }] of Object.entries(SOURCES)) {
  const old = previous.items.filter((i) => i.source === key && (i.status === "drop-in" || i.status === "anytime" || !hasStarted(i.firstDate, now)));
  try {
    const rows = await run(ctx);
    // A sudden collapse means the feed broke, not that the classes vanished.
    if (old.length >= 10 && rows.length < old.length / 2) throw new Error(`Only ${rows.length} classes, was ${old.length}`);
    items.push(...rows);
    sources[key] = { label, ok: true, count: rows.length, lastSuccess: now };
  } catch (e) {
    console.error(`${key} failed:`, e);
    items.push(...old);
    sources[key] = { label, ok: false, count: old.length, lastSuccess: previous.sources[key]?.lastSuccess ?? null, error: e.message };
  }
}

async function geocode(address) {
  if (!address || !/\d/.test(address)) return null;
  if (geo[address]) return geo[address];
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(address.includes("OH") ? address : `${address}, Columbus, OH`)}`;
  try {
    const hit = (await http(url, { retries: 2 })).result.addressMatches[0]?.coordinates;
    if (hit) geo[address] = { lat: hit.y, lon: hit.x };
    return geo[address] ?? null;
  } catch { return null; }
}

for (const i of items) {
  if (i.lat == null) Object.assign(i, (await geocode(i.address)) ?? {});
  i.miles = i.lat != null ? milesBetween(ANCHOR, i) : null;
}
for (const p of providers) {
  Object.assign(p, (await geocode(p.address)) ?? {});
  p.miles = p.lat != null ? milesBetween(ANCHOR, p) : null;
}

// Track what's genuinely new. The first run sets the baseline so everything isn't "new".
const firstRun = !state.baselineAt;
if (firstRun) state.baselineAt = now;
// Full classes aren't published, but stay tracked so a reopened spot can be flagged.
for (const i of items) {
  // A source joining the site for the first time isn't news; only what it adds later is.
  const s = (state.seen[i.id] ??= { firstSeen: previous.sources[i.source] ? now : state.baselineAt });
  if (s.full && i.status !== "full") s.spotOpenedAt = now;
  s.full = i.status === "full";
  i.firstSeen = s.firstSeen;
  if (s.spotOpenedAt) i.spotOpenedAt = s.spotOpenedAt;
}
const published = items.filter((i) => i.status !== "full");

state.watch = await checkProviders(providers, state.watch, now);
const merged = providers.map((p) => ({ ...p, changedAt: state.watch[p.id]?.changedAt ?? null, watchOk: state.watch[p.id]?.ok ?? false }));

write(DATA, {
  checkedAt: now,
  baselineAt: state.baselineAt,
  anchor: ANCHOR.name,
  sources,
  items: published.sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.name.localeCompare(b.name)),
  providers: merged,
});
write(STATE, state);
write(GEO, geo);
console.log(Object.entries(sources).map(([k, v]) => `${k}: ${v.ok ? "ok" : "FAILED"} ${v.count}`).join(" | "), `| providers ${merged.filter((p) => p.watchOk).length}/${merged.length}`);
