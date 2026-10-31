// Columbus Recreation & Parks, via the public JSON feed behind its ActiveNet site.
import { categorize, forYoungKids, http, mapLimit, nameTimeConflict, recStatus } from "../lib.mjs";

const REST = "https://anc.apm.activecommunities.com/columbusrecparks1/rest";
const DETAIL_URL = (id) => `https://anc.apm.activecommunities.com/columbusrecparks1/activity/search/detail/${id}?onlineSiteId=0&from_original_cui=true`;
const SKIP = /adult|senior|\b55\+|practice crpd|staff/i;

const search = (age) => ({
  activity_search_pattern: {
    skills: [], time_after_str: "", days_of_week: null, activity_select_param: 2, center_ids: [],
    time_before_str: "", open_spots: null, activity_id: null, activity_category_ids: [], date_before: "",
    min_age: age, date_after: "", activity_type_ids: [], site_ids: [], for_map: false, geographic_area_ids: [],
    season_ids: [], activity_department_ids: [], activity_other_category_ids: [], child_season_ids: [],
    activity_keyword: "", instructor_ids: [], max_age: age, custom_price_from: "", custom_price_to: "",
  },
  activity_transfer_pattern: {},
});

async function listForAge(age) {
  const items = [];
  for (let page = 1; ; page++) {
    const d = await http(`${REST}/activities/list?locale=en-US`, {
      body: search(age),
      headers: { page_info: JSON.stringify({ order_by: "Date range", page_number: page, total_records_per_page: 20 }) },
    });
    items.push(...d.body.activity_items);
    if (page >= d.headers.page_info.total_page) return items;
  }
}

// The list only shows parent entries like "Swimming Lessons PreK Level 1"; the bookable sections sit underneath.
async function expand(a) {
  if (!/More \(\d+\)/.test(a.action_link?.label ?? "")) return [a.id];
  const d = await http(`${REST}/activities/subs/${a.id}?locale=en-US`, {
    body: { sub_activity_ids: "", activity_transfer_pattern: {}, open_spots: 0 },
  });
  return (d.body.sub_activities ?? []).map((s) => s.id);
}

const toMonths = (y, m) => (y == null ? 0 : y * 12) + (m ?? 0);
const hm = (t) => (t ?? "").slice(0, 5);

function price(p) {
  if (p.free) return "Free";
  const parts = (p.prices?.[0]?.details ?? []).map((x) => `${x.price} ${x.description.toLowerCase()}`);
  return parts.length ? parts.join(", ") : "See listing";
}

async function loadClass(id, ctx) {
  const [det, meet, cost] = await Promise.all([
    http(`${REST}/activity/detail/${id}?locale=en-US`),
    http(`${REST}/activity/detail/meetingandregistrationdates/${id}?locale=en-US`),
    http(`${REST}/activity/detail/estimateprice/${id}?locale=en-US`),
  ]);
  const d = det.body.detail;
  const m = meet.body.meeting_and_registration_dates;
  if (!d?.activity_name || d.is_parent_activity) return null;
  const name = d.activity_name.trim();
  if (SKIP.test(name) || /adult|therapeutic/i.test(`${d.sub_category} ${d.category}`)) return null;
  if (/current students only/i.test(d.catalog_description ?? "")) return null;
  if (!d.last_date || d.last_date < ctx.now.slice(0, 10)) return null;

  const hasMax = d.age_max_year > 0 || d.age_max_month > 0;
  const ageMin = toMonths(d.age_min_year, d.age_min_month);
  if (!forYoungKids(ageMin)) return null;

  const reg = m.enrollment_datetimes?.[0] ?? {};
  const status = recStatus({
    space: d.space_status, opensAt: reg.first_daytime_internet, closesAt: reg.last_daytime_internet,
    firstDate: d.first_date, now: ctx.now,
  });
  if (!status) return null;

  const slots = (m.activity_patterns ?? []).flatMap((p) => p.pattern_dates ?? []);
  const startTime = hm(slots[0]?.starting_time);
  const center = d.centers?.[0];
  const openings = Number(d.space_status?.match(/^(\d+) opening/)?.[1]) || null;
  const conflict = nameTimeConflict(name, startTime);

  return {
    id: `rec-${id}`,
    source: "rec",
    provider: "Columbus Rec & Parks",
    name,
    category: categorize(`${name} ${d.sub_category ?? ""}`),
    ages: d.age_description?.replace(/,\s*$/, "") ?? "",
    ageMin,
    ageMax: hasMax ? toMonths(d.age_max_year, d.age_max_month) : null,
    days: [...new Set(slots.flatMap((s) => s.weekdays.split(/,\s*/)))],
    startTime,
    endTime: hm(slots[0]?.ending_time),
    firstDate: d.first_date,
    lastDate: d.last_date,
    sessions: d.other_info?.sessions || null,
    location: center?.name ?? (/1160 Hunter/.test(d.location_description) ? "Columbus Aquatics Center" : d.location_description) ?? "",
    address: center ? `${center.address1}, ${center.city}, ${center.state} ${center.zip_code}` : d.location_description ?? "",
    lat: center?.latitude ?? null,
    lon: center?.longitude ?? null,
    price: price(cost.body.estimateprice),
    status,
    openings,
    opensAt: reg.first_daytime_internet ?? null,
    closesAt: reg.last_daytime_internet ?? null,
    notes: conflict ? [conflict] : [],
    url: DETAIL_URL(id),
  };
}

export async function fetchRec(ctx) {
  // Age 0 makes the feed ignore age and return its whole catalog, so the search starts at 1.
  const lists = await Promise.all([1, 2, 3, 4, 5, 6].map(listForAge));
  const byId = new Map(lists.flat().map((a) => [a.id, a]));
  const ids = (await mapLimit([...byId.values()], 3, expand)).flat();
  const rows = await mapLimit([...new Set(ids)], 3, (id) => loadClass(id, ctx));
  return rows.filter(Boolean);
}
