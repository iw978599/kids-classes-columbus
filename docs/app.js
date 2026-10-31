import {
  filterItems, formatDate, formatDateTime, formatTime, groupItems, isNew, liveStatus, placeOptions, reopened,
} from "./logic.mjs";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const STATUS = {
  open: ["Open", "good"], upcoming: ["Opens soon", "soon"],
  anytime: ["Join anytime", "good"], "drop-in": ["Drop in", ""], contact: ["Contact", ""],
};
const filters = { fitsOnly: true, showDropIn: false, showAnytime: true, place: "", hidden: new Set(), startsFrom: "", maxMiles: 0, search: "" };
const slug = (c) => c.toLowerCase().replace(/\s+/g, "-");

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
  const flags = [
    reopened(i, ctx.now) ? '<span class="mk alert">Spot opened</span>' : "",
    isNew(i, ctx.baselineAt, ctx.now) ? '<span class="mk alert">New</span>' : "",
  ].join("");
  return `<article class="item${i.price === "Free" ? " free" : ""}" data-c="${slug(i.category)}">
    <div class="r1"><span class="tag">${esc(i.category)}</span><span class="tm">${esc(when(i))}</span></div>
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
    <div class="r1"><span class="tag">${esc(p.category)}</span>${p.miles != null ? `<span class="tm">${p.miles} mi</span>` : ""}</div>
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
  try { localStorage.setItem("theme", theme); } catch {}
}

const sortedProviders = (data) =>
  [...data.providers].sort((a, b) => (b.changedAt ?? "").localeCompare(a.changedAt ?? "") || (a.miles ?? 999) - (b.miles ?? 999));

function render(data) {
  const ctx = { now: easternNow(), baselineAt: data.baselineAt };
  const shown = filterItems(data.items, filters, ctx.now);
  const groups = groupItems(shown, ctx.now);
  $("count").textContent = `${shown.length} / ${data.items.length}`;
  $("count").title = `${shown.length} of ${data.items.length} classes shown`;

  $("providers").innerHTML = sortedProviders(data).filter((p) => !filters.place || p.provider === filters.place).map(providerCard).join("");
  $("providers-section").hidden = !$("providers").innerHTML;

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
