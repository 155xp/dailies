import { describe, expect, it } from "vitest";
import { PARSERS } from "../../src/parsers";
import type { DailyRecord } from "../../src/record";
import { loadCapture } from "../../test/capture";
import { result, tiles } from "../src/summary";

const rec = (game: DailyRecord["game"], dir: string) => PARSERS[game](loadCapture(game, dir))!;

describe("row summary from real fixture records", () => {
  it.each([
    ["krillion", "win-2026-11-22", "405 points", 7],
    ["krillion", "partial-2026-11-22", "50 points", 7],
    ["travle", "win-2026-11-22", "+3", 6],
    ["travle", "loss-2026-11-22", "3 away", 7],
    ["enclose-horse", "win-2026-11-22", "49 of 49", 1],
    ["wordle", "win-2026-11-22", "3/6", 3],
    ["wordle", "loss-2026-11-22", "X/6", 6],
    ["connections", "win-2026-11-22", "1 mistake", 5],
    ["connections", "loss-2026-11-22", "4 mistakes", 5],
    ["spelling-bee", "partial-2026-11-22", "Good Start", 9],
    ["globle", "win-2026-11-22", "9 guesses", 9],
    ["songless", "win-2026-11-22", "Got it on try 4", 4],
    ["songless", "loss-2026-11-22", "Missed", 5],
    ["spamle", "win-2026-11-23", "146 points", 5],
    ["spamle", "partial-2026-11-23", "27 points, 2 of 5 rounds", 2],
  ] as const)("%s %s reads %s with %i tiles", (game, dir, text, count) => {
    const r = rec(game, dir);
    expect(result(r)).toBe(text);
    expect(tiles(r)).toHaveLength(count);
  });

  it("colors tiles from the game's own palette", () => {
    expect(tiles(rec("krillion", "win-2026-11-22"))[0]).toBe("#ffd166");
    expect(tiles(rec("wordle", "win-2026-11-22")).at(-1)).toBe("#6aaa64");
    expect(tiles(rec("connections", "win-2026-11-22")).slice(1)).toEqual(["#f9df6d", "#a0c35a", "#b0c4ef", "#ba81c5"]);
    expect(tiles(rec("songless", "win-2026-11-22")).at(-1)).toBe("rgb(85, 183, 37)");
    // One tile per round in the game's round-rating color: Great #5dffb0, Spamtastic #b18cff.
    expect(tiles(rec("spamle", "partial-2026-11-23"))).toEqual(["#5dffb0", "#b18cff"]);
  });

  it("fills the Spelling Bee ladder up to the rank reached", () => {
    const ladder = tiles(rec("spelling-bee", "partial-2026-11-22"));
    expect(ladder.filter((c) => c === "#f7da21")).toHaveLength(2);
  });

  it("caps a long strip at 10 tiles", () => {
    const globle = rec("globle", "win-2026-11-22");
    const long = { ...globle, detail: { ...globle.detail, heat: Array(14).fill("cold") } } as DailyRecord;
    expect(tiles(long)).toHaveLength(10);
  });
});
