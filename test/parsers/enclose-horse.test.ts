import { describe, expect, it } from "vitest";
import { enclosure, parseEncloseHorse } from "../../src/parsers/enclose-horse";
import { loadCapture } from "../capture";

describe("parseEncloseHorse", () => {
  const win = loadCapture("enclose-horse", "win-2026-11-22");
  const partial = loadCapture("enclose-horse", "partial-2026-11-22");

  it("reads the submission, level and server ranking", () => {
    expect(parseEncloseHorse(win)).toMatchObject({
      game: "enclose-horse",
      puzzleNo: 328,
      date: "2026-11-22",
      status: "won",
      score: 49,
      detail: { optimal: 49, rank: 1, percentile: 100, medal: "perfect" },
    });
  });

  it("reads a poor enclosure as partial with a bronze medal", () => {
    expect(parseEncloseHorse(partial)).toMatchObject({
      status: "partial",
      score: 10,
      detail: { rank: 16955, percentile: 1, medal: "bronze" },
    });
  });

  it("keeps what a card needs to redraw the board", () => {
    const d = parseEncloseHorse(win)?.detail;
    expect(d).toMatchObject({ cols: 15, rows: 13 });
    expect(d?.map.split("\n")[0]).toBe("~.~.~.~~.~..~.~");
    expect(enclosure(d?.map.split("\n") ?? [], d?.walls ?? []).cells).toHaveLength(51);
  });

  it("recomputes the game's own scores from map and walls", () => {
    for (const capture of [win, partial]) {
      const d = parseEncloseHorse(capture)?.detail;
      expect(enclosure(d?.map.split("\n") ?? [], d?.walls ?? [])).toMatchObject({ escaped: false, score: d?.score });
    }
  });

  it("scores the optimal walls from the submit response as the optimum", () => {
    const submit = partial.responses?.find((x) => x.url.endsWith("/submit"))?.body as { stats: { optimalWalls: number[] } };
    const map = parseEncloseHorse(partial)?.detail.map.split("\n") ?? [];
    expect(enclosure(map, submit.stats.optimalWalls).score).toBe(49);
  });

  it("detects an escaping horse", () => {
    expect(enclosure(parseEncloseHorse(win)?.detail.map.split("\n") ?? [], []).escaped).toBe(true);
  });

  it("reads the score histogram", () => {
    const hist = parseEncloseHorse(win)?.detail.histogram ?? [];
    expect(hist).toHaveLength(46);
    expect(hist[0]).toEqual({ minScore: -1, maxScore: -1, count: 2 });
  });

  it("returns null without the level data", () => {
    expect(parseEncloseHorse({ localStorage: win.localStorage ?? {} })).toBeNull();
  });
});
