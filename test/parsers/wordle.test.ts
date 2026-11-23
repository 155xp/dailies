import { describe, expect, it } from "vitest";
import { parseWordle } from "../../src/parsers/wordle";
import { loadCapture } from "../capture";

const SQUARE: Record<string, string> = { "🟩": "correct", "🟨": "present", "⬜": "absent", "⬛": "absent" };

/** The marks the share text shows, one array per guess row. */
function shareMarks(share: string): string[][] {
  return share
    .split("\n")
    .filter((l) => /^[🟩🟨⬜⬛]+$/u.test(l))
    .map((l) => [...l].map((c) => SQUARE[c] ?? "?"));
}

describe("parseWordle", () => {
  const win = loadCapture("wordle", "win-2026-11-22");
  const loss = loadCapture("wordle", "loss-2026-11-22");

  it("reads a win from storage and the puzzle response", () => {
    const r = parseWordle(win);
    expect(r).toMatchObject({
      game: "wordle",
      puzzleId: "4823",
      puzzleNumber: 1982,
      date: "2026-11-22",
      outcome: "win",
      score: 3,
      scoreUnit: "guesses",
      maxScore: 6,
    });
    expect(r?.guesses.map((g) => g.value)).toEqual(["under", "spend", "upend"]);
    expect(r?.guesses.map((g) => g.mark)).toEqual(["incorrect", "incorrect", "correct"]);
  });

  it("grades every letter the same way the share text does", () => {
    for (const capture of [win, loss]) {
      const r = parseWordle(capture);
      expect(r?.guesses.map((g) => g.parts?.map((p) => p.mark))).toEqual(shareMarks(capture.share ?? ""));
    }
  });

  it("uses the game's tile colors", () => {
    const first = parseWordle(win)?.guesses[0]?.parts;
    expect(first?.map((p) => [p.value, p.color])).toEqual([
      ["u", "#6aaa64"],
      ["n", "#c9b458"],
      ["d", "#c9b458"],
      ["e", "#c9b458"],
      ["r", "#787c7e"],
    ]);
  });

  it("reads a loss", () => {
    const r = parseWordle(loss);
    expect(r).toMatchObject({ outcome: "loss", score: 6, puzzleId: "4823" });
    expect(r?.guesses.map((g) => g.value)).toEqual(["crane", "moist", "blimp", "hound", "fudge", "weary"]);
  });

  it("falls back to share squares when the puzzle response is missing", () => {
    const r = parseWordle({ ...win, responses: [] });
    expect(r?.guesses[0]?.parts?.map((p) => p.mark)).toEqual(["correct", "present", "present", "present", "absent"]);
    expect(r?.puzzleNumber).toBe(1982);
  });

  it("reports no distribution signed out (fixtures/wordle/win-2026-11-22/dom.html)", () => {
    expect(parseWordle(win)?.distribution).toBeUndefined();
    expect(parseWordle(win)?.percentile).toBeUndefined();
  });

  it("returns null when there is no Wordle state", () => {
    expect(parseWordle({})).toBeNull();
  });
});
