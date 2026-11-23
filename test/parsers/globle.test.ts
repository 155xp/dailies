import { describe, expect, it } from "vitest";
import { parseGloble } from "../../src/parsers/globle";
import { loadCapture } from "../capture";

describe("parseGloble", () => {
  const win = loadCapture("globle", "win-2026-11-22");
  const partial = loadCapture("globle", "partial-2026-11-22");

  it("reads a win from the guesses and statistics keys", () => {
    expect(parseGloble(win)).toMatchObject({ game: "globle", date: "2026-11-22", status: "won", score: 9 });
  });

  it("keeps every guess in order with the heat the game gave it", () => {
    const d = parseGloble(win)?.detail;
    expect(d?.countries.map((c, i) => [c, d.heat?.[i]])).toEqual([
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
    expect(parseGloble(partial)).toMatchObject({
      status: "partial",
      score: 4,
      detail: { countries: ["Canada", "Egypt", "Russia", "Türkiye"], heat: null },
    });
  });

  it("returns null when there are no guesses", () => {
    expect(parseGloble({})).toBeNull();
  });
});
