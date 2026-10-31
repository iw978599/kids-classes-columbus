// Shared helpers. Pure functions here are covered by test/lib.test.mjs.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36";

export const ANCHOR = { name: "Schiller Park", lat: 39.9403, lon: -82.9934 };

export async function http(url, { json = true, body, headers = {}, retries = 3 } = {}) {
  let err;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, {
        method: body ? "POST" : "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(45000),
        body: body ? JSON.stringify(body) : undefined,
        headers: {
          "User-Agent": UA,
          ...(json ? { Accept: "application/json" } : {}),
          ...(body ? { "Content-Type": "application/json;charset=utf-8" } : {}),
          ...headers,
        },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return json ? await r.json() : await r.text();
    } catch (e) {
      err = e;
      await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
    }
  }
  throw err;
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// Local Columbus time as "YYYY-MM-DD HH:MM:SS", matching how providers publish times.
export function localNow(date = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

// The site covers kids through age 6, so anything that starts at 7 or later is skipped.
export const forYoungKids = (minMonths) => (minMonths ?? 0) < 84;

export function milesBetween(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(7917.6 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

const CATEGORIES = [
  ["Camps", /\bcamps?\b|bootcamp/i],
  ["Swim", /swim|aquatic/i],
  ["Gymnastics", /gymnast|tumbl|gymtastic|gym skills/i],
  ["Dance", /ballet|dance|dancing|\btap\b|hip hop|\bstep\b|cheer|movement/i],
  ["Theatre", /theat|acting|drama|story explorers|playwrit/i],
  ["Music", /music|drum|piano|guitar|singing|voice/i],
  ["Arts", /\bart\b|ceramic|craft|paint|glass|pottery|draw/i],
  ["Story time", /storytime|story time|kids create/i],
  ["Sports", /soccer|basketball|tennis|karate|kung fu|martial|sporties|baseball|t-ball|flag football|sport|gym\b|volleyball/i],
];
export function categorize(text) {
  return CATEGORIES.find(([, re]) => re.test(text))?.[0] ?? "Other";
}

// "Saturdays 10:30am ..." vs a real start of 10:10 → flag it, since the city's data disagrees with itself.
export function nameTimeConflict(name, startTime) {
  const m = name.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i);
  if (!m || !startTime) return null;
  let h = Number(m[1]) % 12;
  if (m[3].toLowerCase() === "pm") h += 12;
  const inName = `${String(h).padStart(2, "0")}:${m[2]}`;
  return inName === startTime ? null : `Title says ${m[1]}:${m[2]}${m[3].toLowerCase()}, schedule says ${startTime}. Confirm before the first class.`;
}

export function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#0?39;|&#x27;|&rsquo;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Rec feed status, from space text and registration window (all local time).
export function recStatus({ space = "", opensAt, closesAt, firstDate, now }) {
  if (/cancel|closed/i.test(space)) return null;
  if (closesAt && closesAt < now) return null;
  if (hasStarted(firstDate, now)) return null;
  if (opensAt && opensAt > now) return "upcoming";
  if (/full/i.test(space)) return "full";
  return opensAt ? "open" : "contact";
}

// Only future sessions belong on the site.
export const hasStarted = (firstDate, now) => firstDate <= now.slice(0, 10);
