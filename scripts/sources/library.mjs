// Columbus Metropolitan Library: free story times and Kids Create at branches near Schiller Park.
import { categorize, http } from "../lib.mjs";

const BRANCHES = {
  "Main Library": "96 S Grant Ave, Columbus, OH 43215",
  Parsons: "1113 Parsons Ave, Columbus, OH 43206",
  "South High": "3540 S High St, Columbus, OH 43207",
  "Driving Park": "1566 E Livingston Ave, Columbus, OH 43205",
  "Marion-Franklin": "2740 Lockbourne Rd, Columbus, OH 43207",
  Franklinton: "1061 W Town St, Columbus, OH 43222",
};
const WANT = /storytime|story time|kids create/i;
const SKIP = /toddler|baby|babies|teen/i;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayOf = (iso) => DAYS[new Date(`${iso}T12:00:00Z`).getUTCDay()];

export async function fetchLibrary(ctx) {
  const req = { private: false, date: ctx.now.slice(0, 10), days: 21, locations: [], ages: [], types: [] };
  const url = `https://events.columbuslibrary.org/eeventcaldata?event_type=0&req=${encodeURIComponent(JSON.stringify(req))}`;
  const events = await http(url, { headers: { "X-Requested-With": "XMLHttpRequest" } });

  // A weekly program is one row, not three.
  const groups = new Map();
  for (const e of events) {
    const title = e.title.trim();
    if (!BRANCHES[e.library] || !WANT.test(title) || SKIP.test(title)) continue;
    const date = e.raw_start_time.slice(0, 10);
    const startTime = e.raw_start_time.slice(11, 16);
    const key = `${e.library}|${title}|${dayOf(date)}|${startTime}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: `lib-${key.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        source: "library",
        provider: "Columbus Metropolitan Library",
        name: title,
        category: categorize(title),
        ages: "Preschool and family",
        days: [dayOf(date)],
        startTime,
        endTime: e.raw_end_time.slice(11, 16),
        firstDate: date,
        lastDate: date,
        sessions: null,
        location: `${e.library} branch`,
        address: BRANCHES[e.library],
        lat: null,
        lon: null,
        price: "Free",
        status: "drop-in",
        openings: null,
        opensAt: null,
        closesAt: null,
        notes: e.allow_reg === "1" ? ["This session uses registration."] : [],
        url: e.url,
      });
    }
    const g = groups.get(key);
    if (date < g.firstDate) { g.firstDate = date; g.url = e.url; }
    if (date > g.lastDate) g.lastDate = date;
  }
  return [...groups.values()];
}
