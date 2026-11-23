import { describe, expect, it } from "vitest";
import { parseKrillion } from "../../src/parsers/krillion";
import { loadCapture } from "../capture";

const EMOJI: Record<string, string> = {
  "🫧": "plankton",
  "🐟": "schooler",
  "🦑": "rare",
  "🏮": "deepcut",
  "🌟": "krillion",
  "⬛": "miss",
};

const shareTiers = (share: string) => [...(share.trim().split("\n").at(-1) ?? "")].map((c) => EMOJI[c] ?? "?");

describe("parseKrillion", () => {
  const win = loadCapture("krillion", "win-2026-11-22");
  const partial = loadCapture("krillion", "partial-2026-11-22");
  const corrected = loadCapture("krillion", "partial-2026-11-22-correction");

  it("reads a full dive from krillion:stats:v1", () => {
    expect(parseKrillion(win)).toMatchObject({
      game: "krillion",
      puzzleId: "2026-11-22",
      puzzleNumber: 130,
      date: "2026-11-22",
      outcome: "win",
      score: 405,
      scoreUnit: "points",
      maxScore: 700,
    });
  });

  it("keeps every answer, its tier color and points, in order", () => {
    expect(parseKrillion(win)?.guesses.map((g) => [g.value, g.mark, g.color, g.points])).toEqual([
      ["Sears", "krillion", "#ffd166", 100],
      ["Discworld", "schooler", "#4de3ff", 30],
      ["Jet bridge", "rare", "#ff5252", 60],
      ["Trebuchet", "rare", "#ff5252", 60],
      ["Chipotle", "plankton", "#8fa3c4", 10],
      ["Sarcoidosis", "rare", "#ff5252", 60],
      ["Silly mid-on", "deepcut", "#9d7bff", 85],
    ]);
    expect(parseKrillion(win)?.guesses[6]?.prompt).toMatch(/^Name a part of the field/);
  });

  it("keeps wrong and blank answers as misses", () => {
    expect(parseKrillion(partial)?.guesses.map((g) => [g.value, g.mark, g.color, g.points])).toEqual([
      ["Toyota", "plankton", "#8fa3c4", 10],
      ["Moby Dick", "miss", "#3d4f6e", 0],
      ["", "miss", "#3d4f6e", 0],
      ["Slingshot", "schooler", "#4de3ff", 30],
      ["", "miss", "#3d4f6e", 0],
      ["Happiness", "miss", "#3d4f6e", 0],
      ["Sideline", "plankton", "#8fa3c4", 10],
    ]);
    expect(parseKrillion(partial)).toMatchObject({ outcome: "partial", score: 50 });
  });

  it("matches the share text tier for tier", () => {
    for (const capture of [win, partial, corrected]) {
      expect(parseKrillion(capture)?.guesses.map((g) => g.mark)).toEqual(shareTiers(capture.share ?? ""));
    }
  });

  it("keeps the server's corrected spelling", () => {
    expect(parseKrillion(corrected)?.guesses[6]?.value).toBe("Penalty area");
  });

  it("reads percentile and the 20-bucket distribution from /api/today/complete", () => {
    const r = parseKrillion(win);
    expect(r?.percentile).toBe(90);
    expect(r?.distribution).toHaveLength(20);
    expect(r?.distribution?.reduce((n, b) => n + b.count, 0)).toBe(4476939);
    expect(parseKrillion(partial)?.percentile).toBe(0);
  });

  it("works from storage alone", () => {
    const r = parseKrillion({ localStorage: win.localStorage ?? {} });
    expect(r?.score).toBe(405);
    expect(r?.percentile).toBeUndefined();
  });

  it("returns null with no finished dive", () => {
    expect(parseKrillion({})).toBeNull();
  });
});
