// Columbus Children's Theatre: the class page lists ages, Ticket Tailor lists dates and availability.
import { forYoungKids, hasStarted, http, mapLimit, textOf } from "../lib.mjs";

const PAGES = ["classes", "camps"].map((p) => `https://www.columbuschildrenstheatre.org/${p}`);
const LISTING = "https://www.tickettailor.com/events/columbuschildrenstheatre";
const event = (id) => `https://tickets.columbuschildrenstheatre.org/events/columbuschildrenstheatre/${id}`;
const MONTHS = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const decode = (s) => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#0?39;/g, "'").replace(/&amp;/g, "&");

// "Sat Jan 23, 2027 9:15 AM - Sat Mar 6, 2027 10:00 AM"; times are sometimes missing.
export function parseRange(text) {
  const re = /(Sun|Mon|Tue|Wed|Thu|Fri|Sat) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{1,2}) ?, ?(\d{4})(?: (\d{1,2}):(\d{2}) (AM|PM))?/g;
  const hits = [...text.matchAll(re)];
  if (!hits.length) return null;
  const iso = (m) => `${m[4]}-${String(MONTHS[m[2]]).padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const time = (m) => {
    if (!m[5]) return "";
    const h = (Number(m[5]) % 12) + (m[7] === "PM" ? 12 : 0);
    return `${String(h).padStart(2, "0")}:${m[6]}`;
  };
  const a = hits[0], b = hits[hits.length - 1];
  return { day: a[1], firstDate: iso(a), lastDate: iso(b), startTime: time(a), endTime: hits.length > 1 ? time(b) : "" };
}

export function parseAges(text) {
  const m = text.match(/\bAges?:?\s*(\d{1,2})\s*(?:-|–|to|&)\s*(\d{1,2})/i) ?? text.match(/\((\d{1,2})\s*[-–]\s*(\d{1,2})\)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function statusOf(label) {
  if (/wait/i.test(label)) return "full";
  if (/sold out|unavailable|closed/i.test(label)) return "full";
  if (/on sale|coming|opens/i.test(label)) return "upcoming";
  if (/tickets|register|book|buy|enroll/i.test(label)) return "open";
  return "contact";
}

function listingCards(html) {
  const cards = new Map();
  const parts = html.split(/(?=<h3 class="event__title">)/).slice(1);
  for (const part of parts) {
    const id = part.match(/columbuschildrenstheatre(?:&#x2F;|\/)(\d+)/)?.[1];
    if (!id) continue;
    const buttons = part.split('class="event__buttons"')[1] ?? "";
    const labels = textOf(buttons.split("</article>")[0]).replace(/Event details/g, "").trim();
    cards.set(id, { title: decode(part.match(/event__link">([^<]+)</)?.[1] ?? ""), label: labels });
  }
  return cards;
}

export async function fetchCct(ctx) {
  const [classes, camps, listing] = await Promise.all([...PAGES, LISTING].map((u) => http(u, { json: false })));
  const page = classes + camps;
  const cards = listingCards(listing);
  const ids = new Set([...cards.keys(), ...[...page.matchAll(/events\/columbuschildrenstheatre\/(\d+)/g)].map((m) => m[1])]);

  const rows = await mapLimit([...ids], 3, async (id) => {
    const html = await http(event(id), { json: false });
    const body = textOf(html);
    // The Squarespace page puts the ages next to each registration link.
    const near = page.slice(page.indexOf(`columbuschildrenstheatre/${id}`), page.indexOf(`columbuschildrenstheatre/${id}`) + 500);
    const ages = parseAges(textOf(`<${near}`)) ?? parseAges(body);
    const range = parseRange(body);
    if (!ages || !range || hasStarted(range.firstDate, ctx.now)) return null;
    if (!forYoungKids(ages[0] * 12)) return null;

    const title = (cards.get(id)?.title || body.split(" – ")[1] || "").trim();
    const name = title.replace(/^(Fall|Winter|Spring|Summer) (Academy|\d+)[^:]*:\s*/i, "").trim() || title;
    return {
      id: `cct-${id}`,
      source: "cct",
      provider: "Columbus Children's Theatre",
      name,
      category: /camp/i.test(name) ? "Camps" : /movement/i.test(name) ? "Dance" : "Theatre",
      ages: `Ages ${ages[0]}–${ages[1]}`,
      // Ranges here are inclusive: "Ages 3 - 6" takes a 6-year-old.
      ageMin: ages[0] * 12,
      ageMax: (ages[1] + 1) * 12,
      days: [range.day],
      startTime: range.startTime,
      endTime: range.endTime,
      firstDate: range.firstDate,
      lastDate: range.lastDate,
      sessions: null,
      location: "CCT Naghten Studios",
      address: "177 E Naghten St, Columbus, OH 43215",
      lat: null,
      lon: null,
      price: "See listing",
      status: cards.has(id) ? statusOf(cards.get(id).label) : "contact",
      openings: null,
      opensAt: null,
      closesAt: null,
      notes: ["CCT cancels classes that don't reach minimum enrollment."],
      url: event(id),
    };
  });
  return rows.filter(Boolean);
}
