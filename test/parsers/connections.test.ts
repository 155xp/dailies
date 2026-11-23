import { describe, expect, it } from "vitest";
import { CONNECTIONS_LEVELS, parseConnections } from "../../src/parsers/connections";
import { loadCapture } from "../capture";

const SQUARE: Record<string, number> = { "🟨": 0, "🟩": 1, "🟦": 2, "🟪": 3 };

function shareRows(share: string): number[][] {
  return share
    .split("\n")
    .filter((l) => /^[🟨🟩🟦🟪]{4}$/u.test(l))
    .map((l) => [...l].map((c) => SQUARE[c] ?? -1));
}

describe("parseConnections", () => {
  const win = loadCapture("connections", "win-2026-11-22");
  const loss = loadCapture("connections", "loss-2026-11-22");

  it("reads a win with one mistake", () => {
    expect(parseConnections(win)).toMatchObject({
      game: "connections",
      date: "2026-11-22",
      puzzleNo: 1260,
      status: "won",
      score: 1,
      detail: { mistakes: 1 },
    });
  });

  it("keeps every guess in order with its words", () => {
    const words = parseConnections(win)?.detail.guesses.map((g) => g.words.join(", "));
    expect(words?.slice(0, 2)).toEqual(["SEA, GUM, HOST, MASS", "SEA, SLEW, HOST, MASS"]);
  });

  it("matches the share text row for row", () => {
    for (const capture of [win, loss]) {
      expect(parseConnections(capture)?.detail.guesses.map((g) => g.levels)).toEqual(shareRows(capture.share ?? ""));
    }
  });

  it("exports the game's group colors by level", () => {
    expect(CONNECTIONS_LEVELS.map((l) => l.color)).toEqual(["#f9df6d", "#a0c35a", "#b0c4ef", "#ba81c5"]);
  });

  it("reads a loss with four mistakes", () => {
    const r = parseConnections(loss);
    expect(r).toMatchObject({ status: "lost", score: 4 });
    expect(r?.detail.guesses.map((g) => g.correct)).toEqual([true, false, false, false, false]);
  });

  it("returns null when there is no Connections state", () => {
    expect(parseConnections({})).toBeNull();
  });
});
