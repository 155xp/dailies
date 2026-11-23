import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");

/**
 * Every tracked game and the kinds of finished result it allows.
 * A game that cannot be won signed out, or has no loss state, says why.
 */
const GAMES: Record<string, { needs: string[]; why?: string }> = {
  krillion: { needs: ["win", "partial"] },
  travle: { needs: ["win", "loss"] },
  "enclose-horse": { needs: ["win", "partial"] },
  wordle: { needs: ["win", "loss"] },
  connections: { needs: ["win", "loss"] },
  "spelling-bee": {
    needs: ["partial"],
    why: "signed out play stops at the Solid rank, so no Genius or Queen Bee",
  },
  mini: { needs: ["gated"], why: "signed out players cannot open the board" },
  globle: { needs: ["win", "partial"], why: "unlimited guesses, no loss state" },
  songless: { needs: ["win", "loss"] },
};

interface Meta {
  game: string;
  case: string;
  sourceUrl: string;
  capturedAt: string;
  puzzleId: string | number;
  sources: string[];
}

function cases(game: string): string[] {
  return readdirSync(join(FIXTURES, game)).filter((d) =>
    statSync(join(FIXTURES, game, d)).isDirectory(),
  );
}

function readMeta(game: string, dir: string): Meta {
  return JSON.parse(readFileSync(join(FIXTURES, game, dir, "meta.json"), "utf8")) as Meta;
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((f) => join(dir, f))
    .filter((f) => statSync(f).isFile());
}

describe("fixtures", () => {
  it("has a directory for every tracked game and nothing else", () => {
    const dirs = readdirSync(FIXTURES).filter((d) => statSync(join(FIXTURES, d)).isDirectory());
    expect(dirs.sort()).toEqual(Object.keys(GAMES).sort());
  });

  for (const [game, rule] of Object.entries(GAMES)) {
    describe(game, () => {
      it("has at least 2 captured cases", () => {
        expect(cases(game).length).toBeGreaterThanOrEqual(2);
      });

      it("covers the result kinds the game allows", () => {
        const kinds = new Set(cases(game).map((d) => readMeta(game, d).case));
        for (const need of rule.needs) expect(kinds).toContain(need);
      });

      it("has a valid meta.json in every case", () => {
        for (const dir of cases(game)) {
          const meta = readMeta(game, dir);
          expect(meta.game).toBe(game);
          expect(dir.startsWith(meta.case)).toBe(true);
          expect(meta.sourceUrl).toMatch(/^https:\/\//);
          expect(Number.isNaN(Date.parse(meta.capturedAt))).toBe(false);
          expect(String(meta.puzzleId).length).toBeGreaterThan(0);
          expect(meta.sources.length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe("fixture privacy", () => {
  const files = filesUnder(FIXTURES);
  const banned: [string, RegExp][] = [
    ["local path", /\/home\/|\/Users\/|[A-Z]:\\Users\\/],
    ["email address", /[\w.+-]+@[\w-]+\.(com|net|org|io|dev|me)\b/],
    ["JWT", /eyJ[\w-]{10,}\.[\w-]{10,}\./],
    ["bearer token", /bearer\s+[\w.-]{16,}/i],
    ["user agent", /Mozilla\/5\.0|HeadlessChrome/],
    ["IPv4 address", /\b(?:\d{1,3}\.){3}\d{1,3}\b(?!\.)/],
  ];

  for (const [label, re] of banned) {
    it(`contains no ${label}`, () => {
      const hits = files.filter((f) => re.test(readFileSync(f, "utf8")));
      expect(hits).toEqual([]);
    });
  }

  it("redacts player and device ids in storage snapshots", () => {
    const idKeys = /"(fencing_player_id|teuteuf-anonymous-id|anonymousId|playerId|runId|krillion:player:v1)"\s*:\s*"([^"]*)"/g;
    for (const f of files.filter((p) => p.endsWith(".json"))) {
      for (const m of readFileSync(f, "utf8").matchAll(idKeys)) {
        expect([f, m[2]]).toEqual([f, "REDACTED"]);
      }
    }
  });
});
