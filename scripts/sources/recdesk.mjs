// Grandview Heights Parks & Recreation (RecDesk). The list has no times, so those show as "not listed".
import { hasStarted, ageMonths, categorize, textOf } from "../lib.mjs";
import { parseBexleyAges as parseAges } from "./bexley.mjs";

const BASE = "https://grandviewheights.recdesk.com/Community";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const ROW = /(?:Register Now|Remaining: \S+|Category: Youth)\s+([^]+?) Youth(?: (No online registration|Registration begins on \S+|Registration ended on \S+))? Dates (\S+(?: - \S+)?) Days (\S+) Ages (.+?) Grades .+? Openings (\S+) Remaining (\S+)/g;

const iso = (s) => {
  const [m, d, y] = s.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

export function parsePrograms(html) {
  const text = textOf(html);
  const youth = text.slice(text.indexOf("Category: Youth"));
  return [...youth.matchAll(ROW)].map((m) => {
    const [first, last] = m[3].split(" - ");
    return {
      // The mobile copy of the previous row can run into the name, so keep only what follows it.
      name: m[1].split(/Register Now|Remaining: \S+/).pop().trim(), reg: m[2] ?? "", firstDate: iso(first), lastDate: iso(last ?? first),
      day: m[4], ages: m[5], remaining: m[7],
    };
  });
}

function status(p, now) {
  if (/ended/.test(p.reg)) return null;
  if (/No online/.test(p.reg)) return "contact";
  if (/begins/.test(p.reg)) return iso(p.reg.split(" ").pop()) > now.slice(0, 10) ? "upcoming" : "open";
  return p.remaining === "0" ? "full" : "open";
}

export async function fetchRecdesk(ctx) {
  const page = await fetch(`${BASE}/Program`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45000) });
  if (!page.ok) throw new Error(`HTTP ${page.status}`);
  const cookie = page.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  await page.text();

  const r = await fetch(`${BASE}/Program/FilterPrograms`, {
    method: "POST",
    signal: AbortSignal.timeout(45000),
    headers: { "User-Agent": UA, Cookie: cookie, "Content-Type": "application/json; charset=utf-8", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify({ ProgramName: "", Code: "", ProgramType: [0], Facility: [0], Days: [0], Age: "4", Pagination: { CurrentPageIndex: 1, PageSize: 100, LoadMore: false } }),
  });
  const html = await r.text();
  if (!r.ok || !html.includes("filtered results")) throw new Error("Unexpected RecDesk response");

  const ids = Object.fromEntries([...html.matchAll(/data-id="(\d+)" data-type="PGM" data-description="([^"]+)"/g)].map((m) => [m[2].replace(/&amp;/g, "&"), m[1]]));
  return parsePrograms(html).flatMap((p) => {
    const ages = parseAges(p.ages);
    const st = status(p, ctx.now);
    if (!ages || !st || hasStarted(p.firstDate, ctx.now)) return [];
    const age = ageMonths(ctx.birthMonth, p.firstDate);
    if (age < ages[0] || age >= ages[1]) return [];
    return [{
      id: `gh-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${p.firstDate}`,
      source: "recdesk",
      provider: "Grandview Heights Parks & Rec",
      name: p.name,
      category: categorize(p.name),
      ages: p.ages,
      days: [p.day],
      startTime: "",
      endTime: "",
      firstDate: p.firstDate,
      lastDate: p.lastDate,
      sessions: null,
      location: "Grandview Heights",
      address: "1525 Goodale Blvd, Grandview Heights, OH 43212",
      lat: null,
      lon: null,
      price: "See listing",
      status: st,
      openings: Number(p.remaining) || null,
      opensAt: /begins/.test(p.reg) ? iso(p.reg.split(" ").pop()) : null,
      closesAt: null,
      notes: /No online/.test(p.reg) ? ["No online registration. Call 614-488-3111."] : [],
      url: ids[p.name] ? `${BASE}/Program/Register?programId=${ids[p.name]}` : `${BASE}/Program`,
    }];
  });
}
