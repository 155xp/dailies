import { describe, expect, it } from "vitest";
import { spamlePage, spamleSnapshot, type SpamlePrompt } from "../../extension/src/spamle-page";
import type { SpamleSnapshot } from "../../src/parsers/spamle";
import { loadCapture } from "../capture";

/** The few parts of Spamle's in-page prompt table (`P`) the snapshot reads, rebuilt from a captured snapshot. */
function fakePage(dir: string) {
  const c = loadCapture("spamle", dir);
  const snap = c.page?.spamle as SpamleSnapshot;
  const P: Record<string, SpamlePrompt> = {};
  for (const [id, p] of Object.entries(snap.prompts)) {
    P[id] = { q: p.q, ans: { length: p.possible }, by: Object.fromEntries(Object.entries(p.names).map(([k, name]) => [k, { name }])), _t: p.targets };
  }
  const targets = (p: SpamlePrompt) => p._t as SpamleSnapshot["prompts"][string]["targets"];
  return { saved: JSON.stringify(c.localStorage?.["spamle-v1"]), P, targets, expected: c.page?.spamle };
}

describe("Spamle page snapshot (MAIN world)", () => {
  for (const dir of ["win-2026-11-23", "partial-2026-11-23"]) {
    it(`${dir}: rebuilds the captured snapshot from the saved day and the page's prompt table`, () => {
      const { saved, P, targets, expected } = fakePage(dir);
      expect(spamleSnapshot(saved, P, targets)).toEqual(expected);
    });
  }

  it("is null with no Daily played live, or unreadable storage", () => {
    const { P, targets } = fakePage("win-2026-11-23");
    expect(spamleSnapshot(null, P, targets)).toBeNull();
    expect(spamleSnapshot("{oops", P, targets)).toBeNull();
    expect(spamleSnapshot(JSON.stringify({ days: { "2026-11-23": { rounds: [] } } }), P, targets)).toBeNull();
  });

  it("returns nothing off a Spamle page, where the page's bindings do not exist", () => {
    expect(spamlePage()).toBeUndefined();
  });
});
