// Studios on Jackrabbit publish a live openings table, including exact seat counts.
import { ageMonths, categorize, hasStarted, http, textOf } from "../lib.mjs";

const STUDIOS = [
  { org: "506905", provider: "Wendy's Gymnastics", address: "2460 Wood Ave, Columbus, OH 43221" },
  { org: "513881", provider: "K Studio Dance", address: "1152 Kenny Centre Mall, Columbus, OH 43220" },
];
const DAY = { Sun: "Sun", Mon: "Mon", Tue: "Tue", Wed: "Wed", Thu: "Thu", Fri: "Fri", Sat: "Sat" };

// "2 yrs 10 mos - 4 yrs" → months. The upper year is inclusive, so "4 yrs" runs through age 4.
export function parseJrAges(text) {
  const part = (s) => {
    const m = s.match(/(?:(\d+)\s*yrs?)?\s*(?:(\d+)\s*mos?)?/);
    return { y: Number(m[1] ?? 0), m: Number(m[2] ?? 0) };
  };
  const [lo, hi] = text.split(" - ").map(part);
  if (!hi) return null;
  return [lo.y * 12 + lo.m, (hi.m ? hi.y * 12 + hi.m + 1 : (hi.y + 1) * 12)];
}

export function parseTime(s) {
  const m = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!m) return "";
  const h = (Number(m[1]) % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

const iso = (s) => {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : "";
};

export function parseRows(html) {
  return [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) => {
    const cells = Object.fromEntries([...row[1].matchAll(/data-title="([^"]+)"[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => [c[1], textOf(c[2])]));
    cells.href = row[1].match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&") ?? "";
    return cells;
  }).filter((c) => c.Class && c.Class !== "Class");
}

async function studio(s, ctx) {
  const html = await http(`https://app.jackrabbitclass.com/jr3.0/Openings/OpeningsDirect?OrgID=${s.org}`, { json: false });
  return parseRows(html).flatMap((c) => {
    const firstDate = iso(c["Class Starts"] ?? "");
    const lastDate = iso(c["Class Ends"] ?? "");
    const openings = Number(c.Openings);
    const ages = c.Ages ? parseJrAges(c.Ages) : null;
    if (!ages || !firstDate || !lastDate || !(openings > 0)) return [];
    if (lastDate <= ctx.now.slice(0, 10) || /party|office use|sibling/i.test(c.Class)) return [];
    const age = ageMonths(ctx.birthMonth, hasStarted(firstDate, ctx.now) ? ctx.now.slice(0, 10) : firstDate);
    if (age < ages[0] || age >= ages[1]) return [];
    const [start, end] = (c.Times ?? "").split(" - ");
    return [{
      id: `jr-${s.org}-${c.href.match(/preLoadClassID=(\d+)/)?.[1] ?? c.Class.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      source: "jackrabbit",
      provider: s.provider,
      name: c.Class.trim().replace(/\.$/, ""),
      category: s.org === "506905" ? "Gymnastics" : categorize(`${c.Class} dance`),
      ages: c.Ages,
      days: (c.Days ?? "").split(/,\s*/).map((d) => DAY[d]).filter(Boolean),
      startTime: parseTime(start ?? ""),
      endTime: parseTime(end ?? ""),
      firstDate,
      lastDate,
      sessions: null,
      location: s.provider,
      address: s.address,
      lat: null,
      lon: null,
      price: c.Tuition ? `$${c.Tuition} tuition` : "See listing",
      // Season-long classes that take students at any point aren't a "new session", so they get their own group.
      status: hasStarted(firstDate, ctx.now) ? "anytime" : "open",
      openings,
      opensAt: null,
      closesAt: null,
      notes: [],
      url: c.href || `https://app.jackrabbitclass.com/jr3.0/Openings/OpeningsDirect?OrgID=${s.org}`,
    }];
  });
}

// Wendy's lists each open gym date as its own class: keep one row per weekly slot, with the next date.
export function collapseOpenGym(rows) {
  const slots = new Map();
  const rest = [];
  for (const r of rows) {
    const m = r.name.match(/^OPEN GYM - (\w+) \d+\/\d+ @ (.+)$/i);
    if (!m) { rest.push(r); continue; }
    const key = `${r.provider}|${m[1].slice(0, 3)}|${m[2]}`;
    const prior = slots.get(key);
    if (!prior || r.firstDate < prior.firstDate) slots.set(key, { ...r, id: `jr-opengym-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, name: `Open gym - ${m[1]} @ ${m[2]}`, lastDate: prior ? prior.lastDate : r.lastDate });
    else if (r.lastDate > prior.lastDate) prior.lastDate = r.lastDate;
  }
  return [...rest, ...slots.values()];
}

export async function fetchJackrabbit(ctx) {
  return collapseOpenGym((await Promise.all(STUDIOS.map((s) => studio(s, ctx)))).flat());
}
