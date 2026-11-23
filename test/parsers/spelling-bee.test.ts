import { describe, expect, it } from "vitest";
import { parseSpellingBee, wordPoints } from "../../src/parsers/spelling-bee";
import { loadCapture } from "../capture";

describe("parseSpellingBee", () => {
  const low = loadCapture("spelling-bee", "partial-2026-11-22");
  const solid = loadCapture("spelling-bee", "partial-paywall-2026-11-22");

  it("reads found words and rank, and scores them", () => {
    expect(parseSpellingBee(low)).toMatchObject({
      game: "spelling-bee",
      date: "2026-11-22",
      status: "partial",
      score: 4,
      detail: { words: ["doth", "hate", "hath", "head"], rank: "Good Start", maxPoints: 224, pangrams: [] },
    });
  });

  it("scores a pangram with its bonus, matching the points the game showed", () => {
    expect(["pothead", "ahead", "deadhead", "deadheaded"].map((w) => wordPoints(w, w === "pothead"))).toEqual([14, 5, 8, 10]);
    expect(parseSpellingBee(solid)?.score).toBe(37);
  });

  it("still scores words without the page data, but cannot know pangrams or the max", () => {
    const r = parseSpellingBee({ localStorage: low.localStorage ?? {} });
    expect(r?.score).toBe(4);
    expect(r?.detail.maxPoints).toBeNull();
  });

  it("returns null when there is no Spelling Bee state", () => {
    expect(parseSpellingBee({})).toBeNull();
  });
});
