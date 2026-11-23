import { describe, expect, it } from "vitest";
import { enclosure, parseEncloseHorse } from "../../src/parsers/enclose-horse";
import { loadCapture } from "../capture";

describe("parseEncloseHorse", () => {
  const win = loadCapture("enclose-horse", "win-2026-11-22");
  const partial = loadCapture("enclose-horse", "partial-2026-11-22");

  it("reads the submission, level and server ranking", () => {
    expect(parseEncloseHorse(win)).toMatchObject({
      game: "enclose-horse",
      puzzleId: "uwtFBO",
      puzzleNumber: 328,
      date: "2026-11-22",
      outcome: "win",
      score: 49,
      scoreUnit: "points",
      maxScore: 49,
      rank: 1,
      percentile: 100,
      rankLabel: "diamond",
    });
  });

  it("reads a poor enclosure as partial with a bronze medal", () => {
    expect(parseEncloseHorse(partial)).toMatchObject({
      outcome: "partial",
      score: 10,
      rank: 16955,
      percentile: 1,
      rankLabel: "bronze",
    });
  });

  it("keeps the layout a card needs to redraw the board", () => {
    const layout = parseEncloseHorse(win)?.layout;
    expect(layout).toMatchObject({ cols: 15, rows: 13 });
    expect(layout?.map[0]).toBe("~.~.~.~~.~..~.~");
    expect(layout?.placed).toEqual([1, 15, 18, 45, 90, 132, 135, 164, 181, 183, 186, 189, 191]);
    expect(layout?.enclosed).toHaveLength(51);
    expect(parseEncloseHorse(partial)?.layout?.enclosed).toHaveLength(10);
  });

  it("recomputes the game's own scores from map and walls", () => {
    for (const capture of [win, partial]) {
      const r = parseEncloseHorse(capture);
      const e = enclosure(r?.layout?.map ?? [], r?.layout?.placed ?? []);
      expect(e).toMatchObject({ escaped: false, score: r?.score });
    }
  });

  it("scores the optimal walls from the submit response as the optimum", () => {
    const submit = partial.responses?.find((x) => x.url.endsWith("/submit"))?.body as { stats: { optimalWalls: number[] } };
    const map = parseEncloseHorse(partial)?.layout?.map ?? [];
    expect(enclosure(map, submit.stats.optimalWalls).score).toBe(49);
  });

  it("detects an escaping horse", () => {
    expect(enclosure(parseEncloseHorse(win)?.layout?.map ?? [], []).escaped).toBe(true);
  });

  it("reads the score histogram", () => {
    const dist = parseEncloseHorse(win)?.distribution ?? [];
    expect(dist).toHaveLength(46);
    expect(dist[0]).toEqual({ label: "-1", count: 2 });
  });

  it("returns null without the level data", () => {
    expect(parseEncloseHorse({ localStorage: win.localStorage ?? {} })).toBeNull();
  });
});
