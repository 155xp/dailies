import { describe, expect, it } from "vitest";
import { parseSpellingBee } from "../../src/parsers/spelling-bee";
import { loadCapture } from "../capture";

describe("parseSpellingBee", () => {
  const low = loadCapture("spelling-bee", "partial-2026-11-22");
  const solid = loadCapture("spelling-bee", "partial-paywall-2026-11-22");

  it("reads found words and rank, and scores them", () => {
    const r = parseSpellingBee(low);
    expect(r).toMatchObject({
      game: "spelling-bee",
      puzzleId: "9300",
      date: "2026-11-22",
      outcome: "partial",
      score: 4,
      scoreUnit: "points",
      maxScore: 224,
      rankLabel: "Good Start",
    });
    expect(r?.guesses.map((g) => [g.value, g.points])).toEqual([
      ["doth", 1],
      ["hate", 1],
      ["hath", 1],
      ["head", 1],
    ]);
  });

  it("scores a pangram with its bonus, matching the points the game showed", () => {
    const r = parseSpellingBee(solid);
    expect(r?.score).toBe(37);
    expect(r?.rankLabel).toBe("Solid");
    expect(r?.guesses.map((g) => [g.value, g.mark, g.points])).toEqual([
      ["pothead", "pangram", 14],
      ["ahead", "word", 5],
      ["deadhead", "word", 8],
      ["deadheaded", "word", 10],
    ]);
  });

  it("still scores words without the page data, but cannot know pangrams or the max", () => {
    const r = parseSpellingBee({ localStorage: low.localStorage ?? {} });
    expect(r?.score).toBe(4);
    expect(r?.maxScore).toBeUndefined();
  });

  it("has no time, hints or distribution (fixtures/spelling-bee/partial-2026-11-22/dom.html)", () => {
    const r = parseSpellingBee(low);
    expect(r?.timeSeconds).toBeUndefined();
    expect(r?.hintsUsed).toBeUndefined();
    expect(r?.distribution).toBeUndefined();
  });

  it("returns null when there is no Spelling Bee state", () => {
    expect(parseSpellingBee({})).toBeNull();
  });
});
