import type { SpamleSnapshot } from "../../src/parsers/spamle";

/** The parts of one entry of Spamle's in-page prompt table (`P`) the snapshot reads. */
export interface SpamlePrompt {
  q: string;
  ans: { length: number };
  by: Record<string, { name: string } | undefined>;
  [other: string]: unknown;
}
type Targets = (p: SpamlePrompt) => SpamleSnapshot["prompts"][string]["targets"];

/**
 * Spamle saves only prompt ids and answer keys. The words players see (the prompt, each answer's name) and each
 * round's targets live in the page's own top-level bindings, which are not `window` properties. Given the saved
 * `spamle-v1` and those bindings, keep just the latest live Daily's prompts and the answers given to them.
 */
export function spamleSnapshot(saved: string | null, P: Record<string, SpamlePrompt | undefined>, targets: Targets): SpamleSnapshot | null {
  let days: Record<string, { live?: boolean; rounds?: { p: string; g?: string[] }[] }>;
  try {
    days = (JSON.parse(saved ?? "null") as { days?: typeof days } | null)?.days ?? {};
  } catch {
    return null;
  }
  const day = Object.keys(days)
    .filter((k) => days[k]!.live && days[k]!.rounds?.length)
    .sort()
    .at(-1);
  if (!day) return null;
  const prompts: SpamleSnapshot["prompts"] = {};
  for (const r of days[day]!.rounds!) {
    const p = P[r.p];
    if (!p) continue;
    prompts[r.p] = { q: p.q, possible: p.ans.length, targets: targets(p), names: Object.fromEntries((r.g ?? []).map((g) => [g, p.by[g]?.name ?? g])) };
  }
  return { day, prompts };
}

// Spamle's page script declares these at its top level (`const P`, `function targets`). A MAIN-world script sees
// them as plain global names, so they are read by name here; off a Spamle page they do not exist.
declare const P: Record<string, SpamlePrompt | undefined>;
declare const targets: Targets;

/** Run in the page (MAIN world): `{ spamle: snapshot }`, or nothing when the page has no such bindings. */
export function spamlePage(): { spamle: SpamleSnapshot } | undefined {
  try {
    if (typeof P !== "object" || !P || typeof targets !== "function") return undefined;
    const snap = spamleSnapshot(window.localStorage.getItem("spamle-v1"), P, targets);
    return snap ? { spamle: snap } : undefined;
  } catch {
    return undefined;
  }
}
