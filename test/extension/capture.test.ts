import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { captureFrom } from "../../extension/src/capture";
import { GAMES, allowResponse, gameForUrl } from "../../extension/src/games";
import { PARSERS } from "../../src/parsers";
import { RECORD } from "../../src/record";
import { loadCapture } from "../capture";

const FIXTURES = join(import.meta.dirname, "..", "..", "fixtures");

/** Cases that end in a finished result the extension should store. The rest must store nothing. */
const LOGGED = new Set([
  "connections/loss-2026-11-22",
  "connections/win-2026-11-22",
  "enclose-horse/partial-2026-11-22",
  "enclose-horse/win-2026-11-22",
  "globle/win-2026-11-22",
  "krillion/partial-2026-11-22",
  "krillion/partial-2026-11-22-correction",
  "krillion/win-2026-11-22",
  "songless/loss-2026-11-22",
  "songless/win-2026-11-22",
  "spamle/partial-2026-11-23",
  "spamle/win-2026-11-23",
  "spelling-bee/partial-2026-11-22",
  "spelling-bee/partial-paywall-2026-11-22",
  "travle/loss-2026-11-22",
  "travle/win-2026-11-22",
  "wordle/loss-2026-11-22",
  "wordle/win-2026-11-22",
]);

describe("capture from what the hooks see", () => {
  it("knows the 10 games in display order", () => {
    expect(GAMES.map((g) => g.id)).toEqual([
      "krillion",
      "travle",
      "enclose-horse",
      "wordle",
      "connections",
      "spelling-bee",
      "mini",
      "globle",
      "songless",
      "spamle",
    ]);
  });

  for (const game of readdirSync(FIXTURES)) {
    for (const dir of readdirSync(join(FIXTURES, game))) {
      const id = `${game}/${dir}`;
      it(`${id}: the page hooks capture ${LOGGED.has(id) ? "the parser's record" : "nothing"}`, () => {
        const meta = JSON.parse(readFileSync(join(FIXTURES, game, dir, "meta.json"), "utf8")) as { sourceUrl: string };
        const def = gameForUrl(meta.sourceUrl);
        expect(def?.id).toBe(game);
        if (!def) return;

        const full = loadCapture(game, dir);
        // A live page holds strings in localStorage, and the fetch hook only passes allowlisted URLs.
        const storage = Object.fromEntries(
          Object.entries(full.localStorage ?? {}).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)]),
        );
        const responses = (full.responses ?? []).filter((r) => allowResponse(def, r.url));
        // The share text arrives through the clipboard or share-sheet hook when the player shares.
        const share = def.share && full.share !== undefined ? { share: full.share } : {};
        const record = captureFrom(def, { ...share, storage, responses, page: full.page ?? {}, indexedDB: full.indexedDB ?? {} });

        if (!LOGGED.has(id)) {
          expect(record).toBeNull();
          return;
        }
        expect(record).toEqual(PARSERS[def.id](full));
        expect(RECORD.safeParse(record).success).toBe(true);
      });
    }
  }

  it("passes only allowlisted responses through the fetch hook", () => {
    const by = (id: string) => GAMES.find((g) => g.id === id)!;
    expect(allowResponse(by("enclose-horse"), "https://api.enclose.horse/api/daily/2026-11-22")).toBe(true);
    expect(allowResponse(by("enclose-horse"), "https://api.enclose.horse/api/levels/uwtFBO/submit")).toBe(true);
    expect(allowResponse(by("enclose-horse"), "https://api.enclose.horse/api/boot")).toBe(false);
    expect(allowResponse(by("enclose-horse"), "https://api.enclose.horse/api/daily/bonus/uwtFBO")).toBe(false);
    expect(allowResponse(by("wordle"), "https://www.nytimes.com/svc/wordle/v2/2026-11-22.json")).toBe(true);
    expect(allowResponse(by("wordle"), "https://www.nytimes.com/svc/games/state/wordleV2/latests?puzzle_ids=4823")).toBe(false);
    expect(allowResponse(by("krillion"), "https://krillion.io/api/today/complete")).toBe(true);
    expect(allowResponse(by("krillion"), "https://krillion.io/api/submit")).toBe(false);
    expect(allowResponse(by("globle"), "https://globle-game.com/answer?day=2026-11-22")).toBe(false);
    expect(allowResponse(by("mini"), "https://www.nytimes.com/svc/crosswords/v6/puzzle/mini.json")).toBe(false);
    const supa = "https://shgtowaowhafjyrbvpxh.supabase.co/rest/v1";
    expect(allowResponse(by("spamle"), `${supa}/rpc/day_totals`)).toBe(true);
    expect(allowResponse(by("spamle"), `${supa}/scores?day=eq.2026-11-23&select=player_id,name,total,n,rounds&order=total.desc,n.desc&limit=100`)).toBe(true);
    for (const no of ["/rpc/log_round", "/rpc/my_leagues", "/rpc/submit_score", "/scores?player_id=eq.x&day=lt.2026-11-23&select=day,total"]) {
      expect(allowResponse(by("spamle"), supa + no), no).toBe(false);
    }
    expect(allowResponse(by("spamle"), "https://other.supabase.co/rest/v1/rpc/day_totals")).toBe(false);
  });

  it("matches pages to games by the manifest patterns only", () => {
    expect(gameForUrl("https://www.nytimes.com/games/wordle/index.html")?.id).toBe("wordle");
    expect(gameForUrl("https://www.nytimes.com/crosswords/game/mini/2026/11/22")?.id).toBe("mini");
    expect(gameForUrl("https://www.nytimes.com/games/strands")).toBeUndefined();
    expect(gameForUrl("https://lessgames.com/wordless")).toBeUndefined();
    expect(gameForUrl("https://spamle.com/?from=share")?.id).toBe("spamle");
    expect(gameForUrl("https://evil.example/krillion.io/")).toBeUndefined();
  });
});
