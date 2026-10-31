import assert from "node:assert/strict";
import { test } from "node:test";
import { ageFits, ageMonths, categorize, localNow, milesBetween, nameTimeConflict, recStatus } from "../scripts/lib.mjs";
import { parseAges, parseRange } from "../scripts/sources/cct.mjs";
import { fingerprint } from "../scripts/sources/watch.mjs";

const BIRTH = "2020-06";

test("age limits treat the upper bound as exclusive", () => {
  assert.equal(ageMonths(BIRTH, "2025-06-01"), 60);
  assert.equal(ageFits(BIRTH, "2025-05-30", 36, 60), true);
  assert.equal(ageFits(BIRTH, "2025-06-01", 36, 60), false);
  assert.equal(ageFits(BIRTH, "2025-06-01", 36, null), true);
  assert.equal(ageFits(BIRTH, "2024-11-01", 54, null), false);
});

test("Rec status follows the registration window", () => {
  const now = "2026-11-01 09:00:00";
  const base = { space: "4 openings remaining", firstDate: "2026-11-14", now };
  assert.equal(recStatus({ ...base, opensAt: "2026-11-03 12:30:00" }), "upcoming");
  assert.equal(recStatus({ ...base, opensAt: "2026-10-01 12:30:00" }), "open");
  assert.equal(recStatus({ ...base, opensAt: "2026-10-01 12:30:00", space: "Full" }), "full");
  assert.equal(recStatus({ ...base, opensAt: "2026-10-01 12:30:00", firstDate: "2026-10-20" }), "in-progress");
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
