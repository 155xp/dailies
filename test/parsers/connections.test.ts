import { describe, expect, it } from "vitest";
import { parseConnections } from "../../src/parsers/connections";
import { loadCapture } from "../capture";

const SQUARE: Record<string, string> = { "🟨": "yellow", "🟩": "green", "🟦": "blue", "🟪": "purple" };

function shareRows(share: string): string[][] {
  return share
    .split("\n")
    .filter((l) => /^[🟨🟩🟦🟪]{4}$/u.test(l))
    .map((l) => [...l].map((c) => SQUARE[c] ?? "?"));
}

describe("parseConnections", () => {
  const win = loadCapture("connections", "win-2026-11-22");
  const loss = loadCapture("connections", "loss-2026-11-22");

  it("reads a win with one mistake", () => {
    expect(parseConnections(win)).toMatchObject({
      game: "connections",
      puzzleId: "1370",
      puzzleNumber: 1260,
      date: "2026-11-22",
      outcome: "win",
      score: 1,
      scoreUnit: "mistakes",
      maxScore: 4,
    });
  });

  it("keeps every guess in order with its words and group colors", () => {
    const [first, second] = parseConnections(win)?.guesses ?? [];
    expect(first).toMatchObject({ value: "SEA, GUM, HOST, MASS", mark: "one away" });
    expect(first?.parts?.map((p) => [p.value, p.mark, p.color])).toEqual([
      ["SEA", "yellow", "#f9df6d"],
      ["GUM", "blue", "#b0c4ef"],
      ["HOST", "yellow", "#f9df6d"],
      ["MASS", "yellow", "#f9df6d"],
    ]);
    expect(second).toMatchObject({ value: "SEA, SLEW, HOST, MASS", mark: "correct" });
  });

  it("matches the share text row for row", () => {
    for (const capture of [win, loss]) {
      const rows = parseConnections(capture)?.guesses.map((g) => g.parts?.map((p) => p.mark));
      expect(rows).toEqual(shareRows(capture.share ?? ""));
    }
  });

  it("reads a loss with four mistakes", () => {
    const r = parseConnections(loss);
    expect(r).toMatchObject({ outcome: "loss", score: 4 });
    expect(r?.guesses.map((g) => g.mark)).toEqual(["correct", "incorrect", "incorrect", "incorrect", "incorrect"]);
  });

  it("reports no distribution signed out (fixtures/connections/win-2026-11-22/dom.html)", () => {
    expect(parseConnections(win)?.distribution).toBeUndefined();
  });

  it("returns null when there is no Connections state", () => {
    expect(parseConnections({})).toBeNull();
  });
});
