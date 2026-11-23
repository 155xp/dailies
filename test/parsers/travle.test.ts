import { describe, expect, it } from "vitest";
import { parseTravle } from "../../src/parsers/travle";
import { loadCapture } from "../capture";

describe("parseTravle", () => {
  const win = loadCapture("travle", "win-2026-11-22");
  const loss = loadCapture("travle", "loss-2026-11-22");

  it("reads a win from travle-game-state and travle-past-games", () => {
    expect(parseTravle(win)).toMatchObject({
      game: "travle",
      puzzleId: "1439",
      date: "2026-11-22",
      outcome: "win",
      score: 6,
      scoreUnit: "guesses",
      par: 3,
      hintsUsed: 0,
    });
  });

  it("keeps every guess in order with its rating", () => {
    const guesses = parseTravle(win)?.guesses.map((g) => [g.value, g.mark]);
    expect(guesses).toEqual([
      ["PAN", "perfect"],
      ["ECU", "good"],
      ["BRA", "good"],
      ["COL", "perfect"],
      ["MEX", "detour"],
      ["PER", "perfect"],
    ]);
  });

  it("reads a loss with a hint", () => {
    const r = parseTravle(loss);
    expect(r).toMatchObject({ outcome: "loss", score: 7, hintsUsed: 1 });
    expect(r?.guesses.map((g) => g.mark)).toEqual(["good", "good", "good", "good", "detour", "detour", "detour"]);
  });

  it("reads the global distribution from the last scores poll", () => {
    const dist = parseTravle(win)?.distribution ?? [];
    expect(dist).toHaveLength(14);
    expect(dist.find((b) => b.label === "+3")?.count).toBe(1617);
    expect(dist.find((b) => b.label === "failed, hints")?.count).toBe(553);
  });

  it("computes the top percent the result chart shows (fixtures/travle/*/dom.html)", () => {
    expect(parseTravle(win)?.topPercent).toBe(95);
    expect(parseTravle(loss)?.topPercent).toBe(100);
  });

  it("works from storage alone, without a distribution", () => {
    const r = parseTravle({ localStorage: win.localStorage ?? {} });
    expect(r?.score).toBe(6);
    expect(r?.distribution).toBeUndefined();
    expect(r?.topPercent).toBeUndefined();
  });

  it("returns null when there is no finished Travle game", () => {
    expect(parseTravle({})).toBeNull();
  });
});
