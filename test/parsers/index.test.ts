import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PARSERS } from "../../src/parsers";
import { loadCapture } from "../capture";

const FIXTURES = join(import.meta.dirname, "..", "..", "fixtures");

describe("PARSERS", () => {
  it("has a parser for every game with fixtures", () => {
    expect(Object.keys(PARSERS).sort()).toEqual(readdirSync(FIXTURES).sort());
  });

  for (const game of readdirSync(FIXTURES)) {
    for (const dir of readdirSync(join(FIXTURES, game))) {
      it(`parses ${game}/${dir} into a result for that game, or null when gated`, () => {
        const parser = PARSERS[game as keyof typeof PARSERS];
        const result = parser(loadCapture(game, dir));
        if (dir.startsWith("gated")) expect(result).toBeNull();
        else expect(result?.game).toBe(game);
      });
    }
  }
});
