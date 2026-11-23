import { describe, expect, it } from "vitest";
import { parseSongless } from "../../src/parsers/songless";
import { loadCapture } from "../capture";

describe("parseSongless", () => {
  const win = loadCapture("songless", "win-2026-11-22");
  const loss = loadCapture("songless", "loss-2026-11-22");

  it("reads a win from the IndexedDB session", () => {
    expect(parseSongless(win)).toMatchObject({
      game: "songless",
      puzzleId: "2026-11-22/0",
      puzzleNumber: 451,
      date: "2026-11-22",
      outcome: "win",
      score: 4,
      scoreUnit: "attempts",
      maxScore: 5,
    });
  });

  it("keeps every attempt in order with its color", () => {
    expect(parseSongless(win)?.guesses.map((g) => [g.value, g.mark, g.color])).toEqual([
      ["Mariah Carey - Always Be My Baby", "present", "rgb(218, 195, 22)"],
      ["The Weeknd - Blinding Lights", "incorrect", "rgb(198, 33, 33)"],
      ["", "skipped", "rgb(48, 52, 54)"],
      ["Mariah Carey - We Belong Together", "correct", "rgb(85, 183, 37)"],
    ]);
  });

  it("reads a loss", () => {
    const r = parseSongless(loss);
    expect(r).toMatchObject({ outcome: "loss", score: 5 });
    expect(r?.guesses.map((g) => g.mark)).toEqual(["skipped", "skipped", "skipped", "skipped", "skipped"]);
  });

  it("computes the top percent the stats modal shows (fixtures/songless/win-2026-11-22/dom.html)", () => {
    expect(parseSongless(win)?.topPercent).toBe(19.1);
    expect(parseSongless(loss)?.topPercent).toBe(100);
    expect(parseSongless(win)?.distribution?.map((b) => b.label)).toEqual(["1", "2", "3", "4", "5", "failed"]);
  });

  it("works from IndexedDB alone", () => {
    const r = parseSongless({ indexedDB: win.indexedDB ?? {} });
    expect(r?.score).toBe(4);
    expect(r?.topPercent).toBeUndefined();
  });

  it("returns null with no finished session", () => {
    expect(parseSongless({})).toBeNull();
  });
});
