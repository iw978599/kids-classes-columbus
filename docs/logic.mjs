// Page logic, kept free of the DOM so test/logic.test.mjs can cover it.
const NEW_DAYS = 14;

export const fitsSchedule = (i) =>
  i.days.some((d) => d === "Sat" || d === "Sun") || (i.startTime ?? "") >= "17:30";

// The data can be hours old, so a class whose registration time has passed counts as open now.
export const liveStatus = (i, now) => (i.status === "upcoming" && i.opensAt && i.opensAt <= now ? "open" : i.status);

export function daysBetween(a, b) {
  return (Date.parse(`${b.slice(0, 10)}T00:00:00Z`) - Date.parse(`${a.slice(0, 10)}T00:00:00Z`)) / 86400000;
}

export const isNew = (i, baselineAt, now) => i.firstSeen > baselineAt && daysBetween(i.firstSeen, now) <= NEW_DAYS;
export const reopened = (i, now) => Boolean(i.spotOpenedAt) && daysBetween(i.spotOpenedAt, now) <= NEW_DAYS;

// A class fits if it overlaps that year of age, so "at least 4y 6m" still shows for a 4-year-old.
export const fitsAge = (i, age) => (i.ageMin ?? 0) < (age + 1) * 12 && (i.ageMax == null || i.ageMax > age * 12);

// Columbus Rec filters by rec center. Everyone else filters by company.
export const placeOf = (i) => (i.source === "rec" && i.location ? i.location : i.provider);

export function placeOptions(items, providers) {
  const sorted = (list) => [...new Set(list)].sort((a, b) => a.localeCompare(b));
  return {
    centers: sorted(items.filter((i) => i.source === "rec").map(placeOf)),
    companies: sorted([...items.filter((i) => i.source !== "rec").map(placeOf), ...providers.map((p) => p.provider)]),
  };
}

export function filterItems(items, f, now) {
  const q = f.search.trim().toLowerCase();
  return items.filter((i) => {
    const status = liveStatus(i, now);
    // The data can be hours old, so a session that began since then drops off here.
    if (!["drop-in", "anytime"].includes(status) && i.firstDate <= now.slice(0, 10)) return false;
    if (status === "drop-in" && !f.showDropIn) return false;
    if (status === "anytime" && !f.showAnytime) return false;
    if (f.fitsOnly && !fitsSchedule(i)) return false;
    if (f.hidden.has(i.category)) return false;
    if (f.place && placeOf(i) !== f.place) return false;
    if (f.neighborhood && i.neighborhood !== f.neighborhood) return false;
    if (f.age != null && !fitsAge(i, f.age)) return false;
    if (f.startsFrom && i.firstDate < f.startsFrom) return false;
    if (f.maxMiles && i.miles != null && i.miles > f.maxMiles) return false;
    if (q && !`${i.name} ${i.provider} ${i.location}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const GROUPS = [
  ["now", "Register now", ["open"]],
  ["soon", "Registration opening soon", ["upcoming"]],
  ["contact", "Contact to enroll", ["contact"]],
  ["anytime", "Join anytime", ["anytime"]],
  ["drop", "Drop in, no registration", ["drop-in"]],
];

export function groupItems(items, now) {
  return GROUPS.map(([key, title, statuses]) => ({
    key,
    title,
    items: items
      .filter((i) => statuses.includes(liveStatus(i, now)))
      .sort((a, b) => (key === "soon" ? (a.opensAt ?? "").localeCompare(b.opensAt ?? "") : 0) || (a.miles ?? 999) - (b.miles ?? 999) || a.firstDate.localeCompare(b.firstDate)),
  })).filter((g) => g.items.length);
}

export function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;
}

export function formatDate(iso) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateTime(s) {
  const time = s.length > 10 ? ` at ${formatTime(s.slice(11, 16))}` : "";
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return `${day}${time}`;
}
