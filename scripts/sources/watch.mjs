// Providers without a readable schedule. We fingerprint the schedule-related text on their
// pages so the site can say "this page changed" instead of pretending to know the classes.
import { createHash } from "node:crypto";
import { http, mapLimit, textOf } from "../lib.mjs";

const SIGNAL = /class|session|regist|enroll|preschool|ages?\b|tuition|schedule|winter|spring|summer|\b20\d\d\b/i;

export function fingerprint(html) {
  const lines = textOf(html).split(/(?<=[.!?])\s+/).filter((s) => SIGNAL.test(s));
  return createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
}

export async function checkProvider(p, previous, now) {
  try {
    const hash = fingerprint(await http(p.watchUrl, { json: false, retries: 2 }));
    const changed = previous?.hash && previous.hash !== hash;
    return { hash, changedAt: changed ? now : previous?.changedAt ?? null, ok: true };
  } catch (e) {
    return { hash: previous?.hash ?? null, changedAt: previous?.changedAt ?? null, ok: false, error: e.message };
  }
}

export const checkProviders = (providers, previous, now) =>
  mapLimit(providers, 3, async (p) => [p.id, await checkProvider(p, previous[p.id], now)]).then(Object.fromEntries);
