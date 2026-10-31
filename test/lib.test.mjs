import assert from "node:assert/strict";
import { test } from "node:test";
import { categorize, forYoungKids, localNow, milesBetween, nameTimeConflict, recStatus } from "../scripts/lib.mjs";
import { parseAges, parseRange } from "../scripts/sources/cct.mjs";
import { parseBexleyAges, parseDateTime } from "../scripts/sources/bexley.mjs";
import { collapseOpenGym, parseJrAges, parseTime } from "../scripts/sources/jackrabbit.mjs";
import { parsePrograms } from "../scripts/sources/recdesk.mjs";
import { fingerprint } from "../scripts/sources/watch.mjs";
import { NO_AREA, neighborhoodOf } from "../scripts/neighborhoods.mjs";

test("classes starting at age 7 or later are out of scope", () => {
  assert.equal(forYoungKids(83), true);
  assert.equal(forYoungKids(84), false);
  assert.equal(forYoungKids(null), true);
  assert.equal(categorize("Coach Reggie Winter Break Camp"), "Camps");
  assert.equal(categorize("6u Basketball Bootcamp"), "Camps");
});

test("Rec status follows the registration window", () => {
  const now = "2026-11-01 09:00:00";
  const base = { space: "4 openings remaining", firstDate: "2026-11-14", now };
  assert.equal(recStatus({ ...base, opensAt: "2026-11-03 12:30:00" }), "upcoming");
  assert.equal(recStatus({ ...base, opensAt: "2026-10-01 12:30:00" }), "open");
  assert.equal(recStatus({ ...base, opensAt: "2026-10-01 12:30:00", space: "Full" }), "full");
  assert.equal(recStatus({ ...base, opensAt: "2026-10-01 12:30:00", firstDate: "2026-10-20" }), null);
  assert.equal(recStatus({ ...base, opensAt: "2026-10-01 12:30:00", firstDate: "2026-11-01" }), null);
  assert.equal(recStatus({ ...base, opensAt: "2026-10-01 12:30:00", firstDate: "2026-10-20", space: "Full" }), null);
  assert.equal(recStatus({ ...base, opensAt: "2026-10-01 12:30:00", closesAt: "2026-10-30 12:00:00" }), null);
  assert.equal(recStatus({ ...base, space: "Cancelled" }), null);
  assert.equal(recStatus({ ...base, opensAt: null }), "contact");
});

test("a title time that disagrees with the schedule is flagged", () => {
  assert.match(nameTimeConflict("Saturdays 10:30am Swim", "10:10"), /Title says 10:30am/);
  assert.equal(nameTimeConflict("Saturdays 11:15am Swim", "11:15"), null);
  assert.equal(nameTimeConflict("Tuesdays 4:00pm Swim", "16:00"), null);
  assert.equal(nameTimeConflict("Mini Ballet", "17:45"), null);
});

test("Ticket Tailor dates and ages parse", () => {
  assert.deepEqual(parseRange("Sat Jan 23, 2027 9:15 AM - Sat Mar 6, 2027 10:00 AM"), {
    day: "Sat", firstDate: "2027-01-23", lastDate: "2027-03-06", startTime: "09:15", endTime: "10:00",
  });
  assert.equal(parseRange("Mon Jan 4 , 2027 - Tue Mar 16 , 2027").startTime, "");
  assert.deepEqual(parseAges("Story Explorers Ages 3 - 6"), [3, 6]);
  assert.deepEqual(parseAges("Group Voice 1 (8-13)"), [8, 13]);
  assert.equal(parseAges("no ages here"), null);
});

test("suburb and studio formats parse", () => {
  assert.deepEqual(parseJrAges("2 yrs 10 mos - 4 yrs"), [34, 60]);
  assert.deepEqual(parseJrAges("1 yr - 12 yrs"), [12, 156]);
  assert.equal(parseTime("6:45pm"), "18:45");
  assert.deepEqual(parseBexleyAges("4y - 5y"), [48, 72]);
  assert.deepEqual(parseBexleyAges("3y"), [36, 48]);
  assert.deepEqual(parseBexleyAges("2y 5m - 5y"), [29, 72]);
  assert.deepEqual(parseDateTime("11/16/2026 - 12/07/2026 04:40 PM - 05:15 PM Jeffrey Mansion - Garage"), {
    firstDate: "2026-11-16", lastDate: "2026-12-07", startTime: "16:40", endTime: "17:15", location: "Jeffrey Mansion - Garage",
  });
  const collapsed = collapseOpenGym([
    { name: "OPEN GYM - Thurs 11/12 @ 6:30pm", provider: "W", firstDate: "2026-11-12", lastDate: "2026-11-12" },
    { name: "OPEN GYM - Thurs 11/5 @ 6:30pm", provider: "W", firstDate: "2026-11-05", lastDate: "2026-11-05" },
    { name: "Ballet", provider: "W", firstDate: "2026-11-05", lastDate: "2026-11-30" },
  ]);
  assert.equal(collapsed.length, 2);
  assert.equal(collapsed[1].firstDate, "2026-11-05");
  const youth = parsePrograms("<p>Category: Youth Little Ballers Youth No online registration Dates 11/7/2026 - 12/19/2026 Days Sat Ages 4y - 6y Grades - Openings n/a Remaining n/a</p>");
  assert.deepEqual(youth[0], { name: "Little Ballers", reg: "No online registration", firstDate: "2026-11-07", lastDate: "2026-12-19", day: "Sat", ages: "4y - 6y", remaining: "n/a" });
});

test("places map to neighborhoods", () => {
  assert.equal(neighborhoodOf({ location: "Schiller Park" }), "German Village & Merion Village");
  assert.equal(neighborhoodOf({ location: "Montrose Elementary School - Gym", address: "2099 Clifton Ave" }), "Bexley");
  assert.equal(neighborhoodOf({ location: "Columbus Aquatics Center", address: "1160 Hunter Ave, 43201" }), "Short North & Campus");
  assert.equal(neighborhoodOf({ location: "", provider: "Columbus Rec & Parks", name: "6U Basketball at Barnett" }), "East Side");
  assert.equal(neighborhoodOf({ location: "Wendy's Gymnastics", address: "2460 Wood Ave" }), "Upper Arlington");
  assert.equal(neighborhoodOf({ location: "Gymnasium", provider: "Columbus Rec & Parks", name: "Family Gym" }), NO_AREA);
});

test("helpers", () => {
  assert.equal(categorize("Swimming Lessons PreK Level 1"), "Swim");
  assert.equal(categorize("Sugar Plum Mini Ballet"), "Dance");
  assert.equal(milesBetween({ lat: 39.94, lon: -82.99 }, { lat: 39.94, lon: -82.99 }), 0);
  assert.equal(localNow(new Date("2026-12-01T17:30:00Z")), "2026-12-01 12:30:00");
});

test("page fingerprints ignore non-schedule text and catch schedule edits", () => {
  const page = (x, y) => `<p>${x}</p><p>Registration for ${y} opens soon.</p>`;
  assert.equal(fingerprint(page("Today's weather is nice.", "winter")), fingerprint(page("It might rain.", "winter")));
  assert.notEqual(fingerprint(page("Today's weather is nice.", "winter")), fingerprint(page("Today's weather is nice.", "spring")));
});
