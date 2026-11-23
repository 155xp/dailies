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
    expect(parseKrillion(win)).toMatchObject({ game: "krillion", puzzleNo: 130, date: "2026-11-22", status: "won", score: 405 });
  });

  it("keeps every answer, its tier color and points, in order", () => {
    expect(parseKrillion(win)?.detail.answers.map((a) => [a.answer, a.tier, a.color, a.points])).toEqual([
      ["Sears", "krillion", "#ffd166", 100],
      ["Discworld", "schooler", "#4de3ff", 30],
      ["Jet bridge", "rare", "#ff5252", 60],
      ["Trebuchet", "rare", "#ff5252", 60],
      ["Chipotle", "plankton", "#8fa3c4", 10],
      ["Sarcoidosis", "rare", "#ff5252", 60],
      ["Silly mid-on", "deepcut", "#9d7bff", 85],
    ]);
    expect(parseKrillion(win)?.detail.answers[6]?.prompt).toMatch(/^Name a part of the field/);
  });

  it("keeps wrong and blank answers as misses with the miss color", () => {
    expect(parseKrillion(partial)?.detail.answers.map((a) => [a.answer, a.tier, a.color, a.points])).toEqual([
      ["Toyota", "plankton", "#8fa3c4", 10],
      ["Moby Dick", null, "#3d4f6e", 0],
      [null, null, "#3d4f6e", 0],
      ["Slingshot", "schooler", "#4de3ff", 30],
      [null, null, "#3d4f6e", 0],
      ["Happiness", null, "#3d4f6e", 0],
      ["Sideline", "plankton", "#8fa3c4", 10],
    ]);
    expect(parseKrillion(partial)).toMatchObject({ status: "partial", score: 50 });
  });

  it("matches the share text tier for tier", () => {
    for (const capture of [win, partial, corrected]) {
      expect(parseKrillion(capture)?.detail.answers.map((a) => a.tier ?? "miss")).toEqual(shareTiers(capture.share ?? ""));
    }
  });

  it("keeps the server's corrected spelling", () => {
    expect(parseKrillion(corrected)?.detail.answers[6]?.answer).toBe("Penalty area");
  });

  it("reads betterThan and the 20-bucket distribution from /api/today/complete", () => {
    const d = parseKrillion(win)?.detail;
    expect(d?.betterThan).toBe(90);
    expect(d?.dist?.reduce((n, c) => n + c, 0)).toBe(4476939);
    expect(parseKrillion(partial)?.detail.betterThan).toBe(0);
  });

  it("works from storage alone", () => {
    expect(parseKrillion({ localStorage: win.localStorage ?? {} })?.score).toBe(405);
  });

  it("returns null with no finished dive", () => {
    expect(parseKrillion({})).toBeNull();
  });
});
