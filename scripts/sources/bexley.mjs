// Bexley Recreation & Parks (MyRec): reads each Early Childhood program's activity table.
import { ageMonths, categorize, hasStarted, http, mapLimit, textOf } from "../lib.mjs";

const BASE = "https://bexleyoh.myrec.com/info/activities";
const DAY = { Su: "Sun", Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat" };

// "4y - 5y" → months, upper year inclusive. "3y" is one year. "15m" is months.
export function parseBexleyAges(text) {
  const months = (part) => [...part.matchAll(/(\d+)\s*(y|m)/gi)].reduce((sum, m) => sum + Number(m[1]) * (m[2].toLowerCase() === "y" ? 12 : 1), 0);
  if (!/\d\s*[ym]/i.test(text)) return null;
  const [lo, hi = lo] = text.split(/\s+-\s+/);
  return [months(lo), months(hi) + (/y\s*$/i.test(hi.trim()) ? 12 : 1)];
}

const to24 = (h, m, ap) => `${String((Number(h) % 12) + (/pm/i.test(ap) ? 12 : 0)).padStart(2, "0")}:${m}`;

export function parseDateTime(text) {
  const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s*-\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*(.*)$/i);
  if (!m) return null;
  return {
    firstDate: `${m[3]}-${m[1]}-${m[2]}`, lastDate: `${m[6]}-${m[4]}-${m[5]}`,
    startTime: to24(m[7], m[8], m[9]), endTime: to24(m[10], m[11], m[12]), location: m[13].trim(),
  };
}

export function parseActivities(html) {
  return html.split(/<tr class="center nobord def">/i).slice(1).map((chunk) => {
    const cell = (title) => textOf(chunk.match(new RegExp(`data-title="${title}"[^>]*>([\\s\\S]*?)</td>`, "i"))?.[1] ?? "");
    return {
      reg: cell("Register"), name: cell("Activity"), ages: cell("Ages"), days: cell("Days"),
      when: cell("Date/Time"), fees: cell("Fees"), id: chunk.match(/ActivityID=(\d+)/)?.[1] ?? "",
    };
  }).filter((a) => a.name);
}

// Some rows leave the days blank, so fall back to the weekday of the first class.
function daysOf(text, firstDate) {
  const days = text.split(/\s+/).map((d) => DAY[d]).filter(Boolean);
  return days.length ? days : [Object.values(DAY)[new Date(`${firstDate}T12:00:00Z`).getUTCDay()]];
}

function statusOf(reg) {
  if (/full|wait/i.test(reg)) return "full";
  if (/unavailable|closed/i.test(reg)) return "contact";
  return "open";
}

export async function fetchBexley(ctx) {
  const index = await http(`${BASE}/default.aspx`, { json: false });
  const start = index.lastIndexOf("Early Childhood Activities");
  const section = index.slice(start, index.indexOf("Youth Activities", start));
  const programs = [...new Set([...section.matchAll(/ProgramID=(\d+)/g)].map((m) => m[1]))];
  if (!programs.length) throw new Error("No Early Childhood programs found");

  const rows = await mapLimit(programs, 2, async (pid) => {
    const html = await http(`${BASE}/program_details.aspx?ProgramID=${pid}`, { json: false });
    return parseActivities(html).flatMap((a) => {
      const when = parseDateTime(a.when);
      const ages = parseBexleyAges(a.ages);
      if (!when || !ages || hasStarted(when.firstDate, ctx.now)) return [];
      const age = ageMonths(ctx.birthMonth, when.firstDate);
      if (age < ages[0] || age >= ages[1]) return [];
      return [{
        id: `bex-${a.id || pid}`,
        source: "bexley",
        provider: "Bexley Recreation & Parks",
        name: a.name,
        category: categorize(a.name),
        ages: a.ages,
        days: daysOf(a.days, when.firstDate),
        startTime: when.startTime,
        endTime: when.endTime,
        firstDate: when.firstDate,
        lastDate: when.lastDate,
        sessions: null,
        location: when.location || "Bexley",
        address: "2099 Clifton Ave, Columbus, OH 43209",
        lat: null,
        lon: null,
        price: a.fees || "See listing",
        status: statusOf(a.reg),
        openings: null,
        opensAt: null,
        closesAt: null,
        notes: [],
        url: `${BASE}/program_details.aspx?ProgramID=${pid}`,
      }];
    });
  });
  return rows.flat();
}
