import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { connectionsRecord, spellingBeeRecord, wordleRecord } from "../src/record";
import { parseConnections } from "../src/parsers/connections";
import { parseSpellingBee } from "../src/parsers/spelling-bee";
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
