import { describe, expect, it } from "vitest";
import { WORDLE_COLORS, parseWordle } from "../../src/parsers/wordle";
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
    expect(parseWordle(win)).toMatchObject({
      game: "wordle",
      date: "2026-11-22",
      puzzleNo: 1982,
      status: "won",
      score: 3,
      detail: { guesses: ["under", "spend", "upend"], hardMode: false },
    });
  });

  it("grades every letter the same way the share text does", () => {
    for (const capture of [win, loss]) {
      expect(parseWordle(capture)?.detail.evaluations).toEqual(shareMarks(capture.share ?? ""));
    }
  });

  it("exports the game's light-mode tile colors", () => {
    expect(WORDLE_COLORS).toEqual({ correct: "#6aaa64", present: "#c9b458", absent: "#787c7e" });
  });

  it("reads a loss", () => {
    expect(parseWordle(loss)).toMatchObject({
      status: "lost",
      score: 6,
      detail: { guesses: ["crane", "moist", "blimp", "hound", "fudge", "weary"] },
    });
  });

  it("falls back to share squares when the puzzle response is missing", () => {
    const r = parseWordle({ ...win, responses: [] });
    expect(r?.detail.evaluations[0]).toEqual(["correct", "present", "present", "present", "absent"]);
    expect(r?.puzzleNo).toBe(1982);
  });

  it("returns null when there is no Wordle state", () => {
    expect(parseWordle({})).toBeNull();
  });
});
