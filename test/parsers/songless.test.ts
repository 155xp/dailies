import { describe, expect, it } from "vitest";
import { SONGLESS_COLORS, parseSongless } from "../../src/parsers/songless";
import { loadCapture } from "../capture";

describe("parseSongless", () => {
  const win = loadCapture("songless", "win-2026-11-22");
  const loss = loadCapture("songless", "loss-2026-11-22");

  it("reads a win from the IndexedDB session", () => {
    expect(parseSongless(win)).toMatchObject({
      game: "songless",
      puzzleNo: 451,
      date: "2026-11-22",
      status: "won",
      score: 4,
      detail: { categoryId: 0 },
    });
  });

  it("keeps every attempt in order", () => {
    expect(parseSongless(win)?.detail.board.map((b) => [b.artist, b.track, b.state])).toEqual([
      ["Mariah Carey", "Always Be My Baby", "present"],
      ["The Weeknd", "Blinding Lights", "incorrect"],
      [null, null, "skipped"],
      ["Mariah Carey", "We Belong Together", "correct"],
    ]);
  });

  it("exports the game's attempt colors", () => {
    expect(SONGLESS_COLORS).toEqual({
      correct: "rgb(85, 183, 37)",
      present: "rgb(218, 195, 22)",
      incorrect: "rgb(198, 33, 33)",
      skipped: "rgb(48, 52, 54)",
    });
  });

  it("reads a loss", () => {
    const r = parseSongless(loss);
    expect(r).toMatchObject({ status: "lost", score: 5 });
    expect(r?.detail.board.map((b) => b.state)).toEqual(["skipped", "skipped", "skipped", "skipped", "skipped"]);
  });

  it("computes the top percent the stats modal shows (fixtures/songless/win-2026-11-22/dom.html)", () => {
    expect(parseSongless(win)?.detail.topPercent).toBe(19.1);
    expect(parseSongless(loss)?.detail.topPercent).toBe(100);
    expect(parseSongless(win)?.detail.distribution).toHaveLength(6);
  });

  it("works from IndexedDB alone", () => {
    const r = parseSongless({ indexedDB: win.indexedDB ?? {} });
    expect(r?.score).toBe(4);
    expect(r?.detail.topPercent).toBeNull();
  });

  it("returns null with no finished session", () => {
    expect(parseSongless({})).toBeNull();
  });
});
