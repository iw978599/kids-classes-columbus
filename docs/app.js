import {
  filterItems, formatDate, formatDateTime, formatTime, groupItems, isNew, liveStatus, placeOptions, readSaved, reopened,
  savedKey, savedView, toggleSaved,
} from "./logic.mjs";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const STATUS = {
  open: ["Open", "good"], upcoming: ["Opens soon", "soon"],
  anytime: ["Join anytime", "good"], "drop-in": ["Drop in", ""], contact: ["Contact", ""],
};
const filters = { fitsOnly: true, showDropIn: false, showAnytime: true, place: "", neighborhood: "", age: null, hidden: new Set(), startsFrom: "", maxMiles: 0, search: "" };
const remember = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
const slug = (c) => c.toLowerCase().replace(/\s+/g, "-");

let saved = readSaved(remember.get("saved"));

// The star on a card: saves the listing in this browser, or forgets it.
function star(key, name) {
  const on = Boolean(saved[key]);
  return `<button type="button" class="star" data-key="${esc(key)}" aria-pressed="${on}" aria-label="${on ? "Unsave" : "Save"} ${esc(name)}" title="${on ? "Remove from Saved" : "Save for later"}">${on ? "★" : "☆"}</button>`;
}

function easternNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function when(i) {
  const time = i.startTime ? `${formatTime(i.startTime)}${i.endTime ? `–${formatTime(i.endTime)}` : ""}` : "Time not listed";
  return `${i.days.join(", ")} ${time}`;
}

function dates(i) {
  const range = i.firstDate === i.lastDate ? formatDate(i.firstDate) : `${formatDate(i.firstDate)}–${formatDate(i.lastDate)}`;
  return `${range}${i.sessions > 1 ? ` · ${i.sessions} sessions` : ""}`;
}

function card(i, ctx) {
  const status = liveStatus(i, ctx.now);
  const [label, tone] = STATUS[status] ?? STATUS.contact;
  const spots = ["open", "anytime"].includes(status) && i.openings ? ` · ${i.openings} left` : "";
  const place = [i.location || "See listing", i.miles != null ? `${i.miles} mi` : "distance unknown"].join(" · ");
  const reg = status === "upcoming" && i.opensAt ? `Registration opens ${formatDateTime(i.opensAt)}`
    : i.closesAt ? `Registration closes ${formatDateTime(i.closesAt)}` : "";
  const started = !["drop-in", "anytime"].includes(status) && i.firstDate <= ctx.now.slice(0, 10);
  const flags = [
    started ? `<span class="mk">Started ${esc(formatDate(i.firstDate))}</span>` : "",
    reopened(i, ctx.now) ? '<span class="mk alert">Spot opened</span>' : "",
    isNew(i, ctx.baselineAt, ctx.now) ? '<span class="mk alert">New</span>' : "",
  ].join("");
  return `<article class="item${i.price === "Free" ? " free" : ""}" data-c="${slug(i.category)}">
    <div class="r1"><span class="tag">${esc(i.category)}</span><span class="tm">${esc(when(i))}</span>${star(savedKey("item", i.id), i.name)}</div>
    <h3><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.name)}</a></h3>
    <div class="meta">${esc(dates(i))}</div>
    <div class="meta">${esc(place)}</div>
    <div class="meta">${esc(i.provider)} · ${esc(i.ages)} · <span class="cost">${esc(i.price)}</span></div>
    ${reg ? `<div class="reg">${esc(reg)}</div>` : ""}
    ${(i.notes ?? []).map((n) => `<div class="note">${esc(n)}</div>`).join("")}
    <div class="marks"><span class="mk ${tone}">${label}${spots}</span>${flags}</div>
  </article>`;
}

function providerCard(p) {
  const changed = p.changedAt ? `<span class="mk alert">Page changed ${esc(formatDate(p.changedAt))}</span>` : "";
  const failed = p.watchOk ? "" : '<span class="mk">Can\'t monitor this page</span>';
  return `<article class="item" data-c="${slug(p.category)}">
    <div class="r1"><span class="tag">${esc(p.category)}</span>${p.miles != null ? `<span class="tm">${p.miles} mi</span>` : ""}${star(savedKey("provider", p.id), p.name)}</div>
    <h3><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a></h3>
    <div class="meta">${esc(p.provider)} · ${esc(p.ages)}</div>
    <div class="meta">${esc(p.schedule)}</div>
    <div class="meta"><span class="cost">${esc(p.price)}</span></div>
    <div class="note">${esc(p.note)}</div>
    ${changed || failed ? `<div class="marks">${changed}${failed}</div>` : ""}
  </article>`;
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("theme").textContent = theme === "light" ? "☾ Dark" : "☀ Light";
  remember.set("theme", theme);
}

const sortedProviders = (data) =>
  [...data.providers].sort((a, b) => (b.changedAt ?? "").localeCompare(a.changedAt ?? "") || (a.miles ?? 999) - (b.miles ?? 999));

function render(data) {
  const ctx = { now: easternNow(), baselineAt: data.baselineAt };
  const shown = filterItems(data.items, filters, ctx.now);
  const groups = groupItems(shown, ctx.now);
  $("count").textContent = `${shown.length} / ${data.items.length}`;
  $("count").title = `${shown.length} of ${data.items.length} classes shown`;

  const cards = sortedProviders(data).filter((p) => (!filters.place || p.provider === filters.place) && (!filters.neighborhood || p.neighborhood === filters.neighborhood));
  $("providers").innerHTML = cards.filter((p) => !p.camp).map(providerCard).join("");
  $("camps").innerHTML = cards.filter((p) => p.camp).map(providerCard).join("");
  $("providers-section").hidden = !$("providers").innerHTML;
  $("camps-section").hidden = !$("camps").innerHTML;

  const mine = savedView(saved, data.items, data.providers);
  const count = mine.items.length + mine.providers.length + mine.gone.length;
  $("saved").hidden = !count;
  $("saved-n").textContent = count;
  $("saved-list").innerHTML = mine.items.map((i) => card(i, ctx)).join("") + mine.providers.map(providerCard).join("");
  $("saved-gone").innerHTML = mine.gone.map((g) => `<li><a href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.name)}</a>${g.provider ? ` · ${esc(g.provider)}` : ""} <span class="mk">No longer listed</span> ${star(g.key, g.name)}</li>`).join("");
  $("saved-gone").hidden = !mine.gone.length;

  const fresh = shown.filter((i) => isNew(i, ctx.baselineAt, ctx.now) || reopened(i, ctx.now));
  $("new").hidden = !fresh.length;
  $("new-list").innerHTML = fresh.map((i) => card(i, ctx)).join("");

  $("groups").innerHTML = groups.map((g) => `<section>
      <h2>${esc(g.title)} <span class="n">${g.items.length}</span></h2>
      <div class="grid">${g.items.map((i) => card(i, ctx)).join("")}</div>
    </section>`).join("") || '<p class="empty">Nothing matches these filters.</p>';
}

function renderOnce(data) {
  $("checked").textContent = `Last checked ${formatDateTime(data.checkedAt)}`;
  $("anchor").textContent = data.anchor;
  const down = Object.values(data.sources).filter((s) => !s.ok);
  $("warn").hidden = !down.length;
  $("warn").textContent = down.map((s) => `${s.label} couldn't be checked. Showing its data from ${s.lastSuccess ? formatDateTime(s.lastSuccess) : "an earlier run"}.`).join(" ");

  const cats = [...new Set(data.items.map((i) => i.category))].sort();
  $("legend").innerHTML = '<button type="button" class="btn tiny" id="allTags">All</button><button type="button" class="btn tiny" id="noTags">None</button>'
    + cats.map((c) => `<button type="button" class="lg" data-c="${slug(c)}" data-cat="${esc(c)}" aria-pressed="true"><i></i>${esc(c)}</button>`).join("");

  const inUse = new Set([...data.items, ...data.providers].map((i) => i.neighborhood));
  $("neighborhood").innerHTML = `<option value="">All neighborhoods</option>${data.neighborhoods.filter((n) => inUse.has(n)).map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}`;
  const { centers, companies } = placeOptions(data.items, data.providers);
  const options = (list) => list.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join("");
  $("place").innerHTML = `<option value="">All places</option><optgroup label="Columbus rec centers">${options(centers)}</optgroup><optgroup label="Companies and cities">${options(companies)}</optgroup>`;
  $("sources").textContent = Object.values(data.sources).map((s) => `${s.label}: ${s.count}`).join(" · ");
}

async function start() {
  setTheme(document.documentElement.dataset.theme);
  $("theme").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light"));
  try {
    const r = await fetch(`data.json?v=${Date.now()}`);
    if (!r.ok) throw new Error(r.status);
    const data = await r.json();
    renderOnce(data);
    render(data);
    const bind = (id, key, read) => $(id).addEventListener("input", (e) => { filters[key] = read(e.target); render(data); });
    bind("fits", "fitsOnly", (t) => t.checked);
    bind("anytime", "showAnytime", (t) => t.checked);
    bind("drop", "showDropIn", (t) => t.checked);
    bind("place", "place", (t) => t.value);
    bind("neighborhood", "neighborhood", (t) => t.value);
    const savedArea = remember.get("neighborhood");
    if (savedArea && [...$("neighborhood").options].some((o) => o.value === savedArea)) { $("neighborhood").value = savedArea; filters.neighborhood = savedArea; render(data); }
    $("neighborhood").addEventListener("input", (e) => remember.set("neighborhood", e.target.value));
    const savedAge = remember.get("age");
    if (savedAge) { $("age").value = savedAge; filters.age = Number(savedAge); render(data); }
    $("age").addEventListener("input", (e) => {
      filters.age = e.target.value === "" ? null : Number(e.target.value);
      remember.set("age", e.target.value);
      render(data);
    });
    bind("starts", "startsFrom", (t) => t.value);
    bind("miles", "maxMiles", (t) => Number(t.value));
    bind("search", "search", (t) => t.value);
    const setAllTags = (on) => {
      filters.hidden.clear();
      document.querySelectorAll(".lg").forEach((chip) => {
        chip.setAttribute("aria-pressed", String(on));
        if (!on) filters.hidden.add(chip.dataset.cat);
      });
      render(data);
    };
    $("allTags").addEventListener("click", () => setAllTags(true));
    $("noTags").addEventListener("click", () => setAllTags(false));
    document.body.addEventListener("click", (e) => {
      const button = e.target.closest(".star");
      if (!button) return;
      const key = button.dataset.key, section = button.closest("section[id]")?.id;
      const [kind, ...rest] = key.split(":"), id = rest.join(":");
      const listing = (kind === "item" ? data.items : data.providers).find((x) => x.id === id);
      if (saved[key] || !listing) { saved = { ...saved }; delete saved[key]; } else saved = toggleSaved(saved, kind, listing, easternNow());
      remember.set("saved", JSON.stringify(saved));
      render(data);
      // The card was drawn again: keep the keyboard on its star, or on the Saved heading if it left.
      const again = [...document.querySelectorAll(".star")].filter((b) => b.dataset.key === key);
      (again.find((b) => b.closest("section[id]")?.id === section) ?? again[0] ?? $("saved-title")).focus();
    });
    $("legend").addEventListener("click", (e) => {
      const chip = e.target.closest(".lg");
      if (!chip) return;
      const on = chip.getAttribute("aria-pressed") === "true";
      chip.setAttribute("aria-pressed", String(!on));
      if (on) filters.hidden.add(chip.dataset.cat); else filters.hidden.delete(chip.dataset.cat);
      render(data);
    });
  } catch {
    $("warn").hidden = false;
    $("warn").textContent = "The class data didn't load. Refresh to try again.";
  }
}
start();
