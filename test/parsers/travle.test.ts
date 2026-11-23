import { describe, expect, it } from "vitest";
import { parseTravle } from "../../src/parsers/travle";
import { loadCapture } from "../capture";

describe("parseTravle", () => {
  const win = loadCapture("travle", "win-2026-11-22");
  const loss = loadCapture("travle", "loss-2026-11-22");

  it("reads a win from travle-game-state and travle-past-games", () => {
    expect(parseTravle(win)).toMatchObject({
      game: "travle",
      puzzleNo: 1439,
      date: "2026-11-22",
      status: "won",
      score: 6,
      detail: { par: 3, hints: 0 },
    });
  });

  it("keeps every guess in order with its rating", () => {
    expect(parseTravle(win)?.detail.guesses).toEqual([
      { country: "PAN", rating: "perfect" },
      { country: "ECU", rating: "good" },
      { country: "BRA", rating: "good" },
      { country: "COL", rating: "perfect" },
      { country: "MEX", rating: "poor" },
      { country: "PER", rating: "perfect" },
    ]);
  });

  it("reads a loss with a hint", () => {
    const r = parseTravle(loss);
    expect(r).toMatchObject({ status: "lost", score: 7, detail: { hints: 1 } });
    expect(r?.detail.guesses.map((g) => g.rating)).toEqual(["good", "good", "good", "good", "poor", "poor", "poor"]);
  });

  it("reads the global distribution from the last scores poll", () => {
    const dist = parseTravle(win)?.detail.distribution ?? [];
    expect(dist).toHaveLength(14);
    expect(dist[10]).toBe(1617); // +3, no hints
    expect(dist[1]).toBe(553); // failed, with hints
  });

  it("computes the top percent the result chart shows (fixtures/travle/*/dom.html)", () => {
    expect(parseTravle(win)?.detail.topPercent).toBe(95);
    expect(parseTravle(loss)?.detail.topPercent).toBe(100);
  });

  it("works from storage alone, without a distribution", () => {
    const r = parseTravle({ localStorage: win.localStorage ?? {} });
    expect(r?.score).toBe(6);
    expect(r?.detail.distribution).toBeNull();
    expect(r?.detail.topPercent).toBeNull();
  });

  it("returns null when there is no finished Travle game", () => {
    expect(parseTravle({})).toBeNull();
  });
});
