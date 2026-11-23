import { describe, expect, it } from "vitest";
import { parseGloble } from "../../src/parsers/globle";
import { loadCapture } from "../capture";

describe("parseGloble", () => {
  const win = loadCapture("globle", "win-2026-11-22");
  const partial = loadCapture("globle", "partial-2026-11-22");

  it("reads a win from the guesses and statistics keys", () => {
    expect(parseGloble(win)).toMatchObject({
      game: "globle",
      puzzleId: "2026-11-22",
      date: "2026-11-22",
      outcome: "win",
      score: 9,
      scoreUnit: "guesses",
    });
  });

  it("keeps every guess in order with the heat the game gave it", () => {
    expect(parseGloble(win)?.guesses.map((g) => [g.value, g.mark])).toEqual([
      ["Brazil", "cold"],
      ["China", "hot"],
      ["Germany", "mild"],
      ["Vietnam", "warm"],
      ["Kazakhstan", "hot"],
      ["India", "hot"],
      ["Pakistan", "hot"],
      ["Iran", "hot"],
      ["Afghanistan", "correct"],
    ]);
  });

  it("reads an unsolved day as partial; heat is not stored until a win", () => {
    const r = parseGloble(partial);
    expect(r).toMatchObject({ outcome: "partial", score: 4 });
    expect(r?.guesses.map((g) => [g.value, g.mark])).toEqual([
      ["Canada", "guess"],
      ["Egypt", "guess"],
      ["Russia", "guess"],
      ["Türkiye", "guess"],
    ]);
  });

  it("has no percentile or distribution (fixtures/globle/win-2026-11-22/dom.html)", () => {
    expect(parseGloble(win)?.percentile).toBeUndefined();
    expect(parseGloble(win)?.distribution).toBeUndefined();
  });

  it("returns null when there are no guesses", () => {
    expect(parseGloble({})).toBeNull();
  });
});
