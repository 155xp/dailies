import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { connectionsRecord, globleRecord, krillionRecord, spellingBeeRecord, travleRecord, wordleRecord } from "../src/record";
import { parseConnections } from "../src/parsers/connections";
import { parseGloble } from "../src/parsers/globle";
import { parseKrillion } from "../src/parsers/krillion";
import { parseSpellingBee } from "../src/parsers/spelling-bee";
import { parseTravle } from "../src/parsers/travle";
import { parseWordle } from "../src/parsers/wordle";
import type { Capture } from "../src/types";
import { loadCapture } from "./capture";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

/** Every fixture case of a game must parse into a record its schema accepts. */
function schemaTest(game: string, parse: (c: Capture) => unknown, schema: z.ZodType) {
  for (const dir of readdirSync(join(FIXTURES, game))) {
    it(`${game}/${dir} emits a valid ${game} record`, () => {
      const result = schema.safeParse(parse(loadCapture(game, dir)));
      expect(result.error?.issues ?? []).toEqual([]);
    });
  }
}

describe("wordle record", () => {
  schemaTest("wordle", parseWordle, wordleRecord);

  it("computes a known board from the solution JSON", () => {
    const noShare = loadCapture("wordle", "win-2026-11-22");
    delete noShare.share;
    expect(parseWordle(noShare)).toEqual({
      game: "wordle",
      date: "2026-11-22",
      puzzleNo: 1982,
      status: "won",
      score: 3,
      detail: {
        guesses: ["under", "spend", "upend"],
        evaluations: [
          ["correct", "present", "present", "present", "absent"],
          ["absent", "correct", "correct", "correct", "correct"],
          ["correct", "correct", "correct", "correct", "correct"],
        ],
        hardMode: false,
      },
    });
  });
});

describe("connections record", () => {
  schemaTest("connections", parseConnections, connectionsRecord);

  it("keeps every guess with its words and true levels", () => {
    const r = parseConnections(loadCapture("connections", "win-2026-11-22"));
    expect(r).toMatchObject({
      date: "2026-11-22",
      puzzleNo: 1260,
      status: "won",
      score: 1,
      detail: {
        solved: [0, 1, 2, 3],
        guesses: expect.arrayContaining([{ words: ["SEA", "GUM", "HOST", "MASS"], levels: [0, 2, 0, 0], correct: false }]),
      },
    });
  });

  it("records only the groups found before a loss", () => {
    const r = parseConnections(loadCapture("connections", "loss-2026-11-22"));
    expect(r).toMatchObject({ status: "lost", score: 4, detail: { mistakes: 4, solved: [0] } });
  });
});

describe("spelling-bee record", () => {
  schemaTest("spelling-bee", parseSpellingBee, spellingBeeRecord);

  it("scores found words and keeps rank, pangrams and the day's maximum", () => {
    expect(parseSpellingBee(loadCapture("spelling-bee", "partial-paywall-2026-11-22"))).toEqual({
      game: "spelling-bee",
      date: "2026-11-22",
      puzzleNo: 9300,
      status: "partial",
      score: 37,
      detail: { words: ["pothead", "ahead", "deadhead", "deadheaded"], pangrams: ["pothead"], rank: "Solid", maxPoints: 224 },
    });
  });
});

describe("krillion record", () => {
  schemaTest("krillion", parseKrillion, krillionRecord);

  const popularity = (dir: string) =>
    (JSON.parse(readFileSync(join(FIXTURES, "krillion", dir, "network", "answer-popularity.json"), "utf8")) as {
      response: { prompts: Record<string, Record<string, number>> };
    }).response.prompts;

  it("keeps 7 answers in order with tier, points and share of the prompt's answers", () => {
    const pop = popularity("win-2026-11-22");
    const share = (p: string, a: string) => (100 * pop[p]![a]!) / Object.values(pop[p]!).reduce((n, c) => n + c, 0);
    const r = krillionRecord.parse(parseKrillion(loadCapture("krillion", "win-2026-11-22")));
    expect(r).toMatchObject({ date: "2026-11-22", puzzleNo: 130, status: "won", score: 405, detail: { betterThan: 90 } });
    expect(r.detail.answers.map((a) => [a.answer, a.tier, a.points])).toEqual([
      ["Sears", "krillion", 100],
      ["Discworld", "schooler", 30],
      ["Jet bridge", "rare", 60],
      ["Trebuchet", "rare", 60],
      ["Chipotle", "plankton", 10],
      ["Sarcoidosis", "rare", 60],
      ["Silly mid-on", "deepcut", 85],
    ]);
    expect(r.detail.answers[0]?.sharePct).toBeCloseTo(share("p1", "Sears"), 9);
    expect(r.detail.answers[4]?.sharePct).toBeCloseTo(share("p5", "Chipotle"), 9);
    expect(r.detail.dist).toHaveLength(20);
  });

  it("gives misses a null tier and share, and keeps what was typed", () => {
    const r = krillionRecord.parse(parseKrillion(loadCapture("krillion", "partial-2026-11-22")));
    expect(r.detail.answers.map((a) => [a.answer, a.tier, a.sharePct === null])).toEqual([
      ["Toyota", "plankton", false],
      ["Moby Dick", null, true],
      [null, null, true],
      ["Slingshot", "schooler", false],
      [null, null, true],
      ["Happiness", null, true],
      ["Sideline", "plankton", false],
    ]);
  });

  it("leaves out dist and betterThan without the complete response, and share without popularity", () => {
    const { localStorage } = loadCapture("krillion", "win-2026-11-22");
    const r = krillionRecord.parse(parseKrillion({ localStorage: localStorage ?? {} }));
    expect(r.detail).not.toHaveProperty("dist");
    expect(r.detail).not.toHaveProperty("betterThan");
    expect(r.detail.answers.every((a) => a.sharePct === null)).toBe(true);
  });
});

describe("travle record", () => {
  schemaTest("travle", parseTravle, travleRecord);

  it("reads a win with ratings, par, route and percentile", () => {
    const r = travleRecord.parse(parseTravle(loadCapture("travle", "win-2026-11-22")));
    expect(r).toMatchObject({
      date: "2026-11-22",
      puzzleNo: 1439,
      status: "won",
      score: 6,
      detail: { par: 3, hints: 0, perfect: false, away: null, optimalRoute: ["CRI", "PAN", "COL", "PER", "CHL"], topPercent: 95 },
    });
    expect(r.detail.guesses.map((g) => g.rating)).toEqual(["perfect", "good", "good", "perfect", "poor", "perfect"]);
    expect(r.detail.distribution).toHaveLength(14);
  });

  it("reads a loss with hints and the countries still missing", () => {
    expect(parseTravle(loadCapture("travle", "loss-2026-11-22"))).toMatchObject({
      status: "lost",
      score: 7,
      detail: { hints: 1, away: 3, topPercent: 100 },
    });
  });
});

describe("globle record", () => {
  schemaTest("globle", parseGloble, globleRecord);

  it("reads a win with per-guess heat and streaks", () => {
    expect(parseGloble(loadCapture("globle", "win-2026-11-22"))).toEqual({
      game: "globle",
      date: "2026-11-22",
      puzzleNo: null,
      status: "won",
      score: 9,
      detail: {
        countries: ["Brazil", "China", "Germany", "Vietnam", "Kazakhstan", "India", "Pakistan", "Iran", "Afghanistan"],
        heat: ["cold", "hot", "mild", "warm", "hot", "hot", "hot", "hot", "correct"],
        currentStreak: 1,
        maxStreak: 1,
      },
    });
  });

  it("has no heat for an unsolved day", () => {
    expect(parseGloble(loadCapture("globle", "partial-2026-11-22"))).toMatchObject({ status: "partial", score: 4, detail: { heat: null } });
  });
});
