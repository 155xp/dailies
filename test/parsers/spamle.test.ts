import { describe, expect, it } from "vitest";
import { parseSpamle, SPAMLE_RARITIES } from "../../src/parsers/spamle";
import { loadCapture } from "../capture";

/** The share text's numbers: `N gumballs · P pts[ · TOP n%]`, then one `count Name` line per rarity. */
function shareNumbers(share: string) {
  const [, balls, pts, top] = share.match(/(\d+) gumballs · (\d+) pts(?: · TOP (\d+)%)?/) ?? [];
  const tiers = ["Common", "Uncommon", "Rare", "Epic", "Legendary"].map((t) => Number(share.match(new RegExp(`(\\d+) ${t}\\n`))?.[1]));
  return { balls: Number(balls), pts: Number(pts), top: top === undefined ? null : Number(top), tiers };
}

describe("parseSpamle", () => {
  const win = loadCapture("spamle", "win-2026-11-23");
  const partial = loadCapture("spamle", "partial-2026-11-23");

  it("reads the finished Daily from spamle-v1", () => {
    expect(parseSpamle(win)).toMatchObject({ game: "spamle", date: "2026-11-23", puzzleNo: 13, status: "won", score: 146 });
  });

  it("matches the game's own share text: gumballs, points, rarity counts and TOP %", () => {
    const r = parseSpamle(win)!;
    const share = shareNumbers(win.share ?? "");
    expect(share).toEqual({ balls: 53, pts: 146, top: 5, tiers: [15, 4, 18, 11, 5] });
    expect([r.detail.gumballs, r.score, r.detail.rarities]).toEqual([share.balls, share.pts, share.tiers]);
    expect(Math.max(1, 100 - Math.round(r.detail.betterThan!))).toBe(share.top);
  });

  it("keeps every round in order with its prompt, points, rating and targets", () => {
    const rounds = parseSpamle(win)!.detail.rounds;
    expect(rounds.map((x) => [x.promptId, x.prompt, x.points, x.rating, x.great, x.top])).toEqual([
      ["genres", "Music genres", 28, "spamtastic", 10, 13],
      ["pokemoves", "Pokémon types and moves", 31, "spamtastic", 10, 13],
      ["grstart", "Words starting with GR", 30, "spamtastic", 12, 15],
      ["hp", "Harry Potter characters", 27, "spamtastic", 10, 13],
      ["popunder1m", "Countries with under 1 million people", 30, "spamtastic", 12, 19],
    ]);
    expect(rounds.map((x) => x.possible)).toEqual([1580, 955, 1173, 519, 38]);
    expect(rounds.map((x) => [x.answers.length, x.misses, x.bonus])).toEqual([
      [10, 1, 10],
      [11, 0, 10],
      [11, 0, 10],
      [10, 0, 10],
      [11, 0, 10],
    ]);
  });

  it("names each answer as the game shows it, with its rarity and points", () => {
    const first = parseSpamle(win)!.detail.rounds[0]!.answers;
    expect(first.slice(0, 4)).toEqual([
      { answer: "Pop", rarity: "common", points: 1 },
      { answer: "Rock", rarity: "common", points: 1 },
      { answer: "Jazz", rarity: "common", points: 1 },
      { answer: "antiphon", rarity: "rare", points: 3 },
    ]);
    expect(first.at(-1)).toEqual({ answer: "Indigenous music of Canada", rarity: "legendary", points: 5 });
  });

  it("reproduces the game's TOP 5% and its 10-bucket spread from day_totals", () => {
    const d = parseSpamle(win)!.detail;
    expect(d.players).toBe(2429);
    expect(d.betterThan).toBeCloseTo(95.06, 2);
    // Everyone who finished, plus this player, in 50-point buckets; the last is 450 and up.
    expect(d.distribution).toEqual([869, 1134, 317, 75, 22, 3, 2, 1, 2, 5]);
  });

  it("reads a partial Daily: only finished rounds count, and no percentile", () => {
    const r = parseSpamle(partial)!;
    expect(r).toMatchObject({ status: "partial", score: 27, puzzleNo: 13, date: "2026-11-23" });
    expect(r.detail.rounds.map((x) => [x.prompt, x.points, x.rating])).toEqual([
      ["Music genres", 12, "great"],
      ["Pokémon types and moves", 15, "spamtastic"],
    ]);
    expect([r.detail.gumballs, r.detail.rarities]).toEqual([13, [6, 0, 7, 0, 0]]);
    expect([r.detail.players, r.detail.betterThan, r.detail.distribution]).toEqual([null, null, null]);
  });

  it("leaves a round in progress out", () => {
    const state = structuredClone(win.localStorage!["spamle-v1"]) as { days: Record<string, { rounds: { done: boolean }[] }> };
    state.days["2026-11-23"]!.rounds[4]!.done = false;
    const r = parseSpamle({ ...win, localStorage: { "spamle-v1": state } })!;
    expect(r).toMatchObject({ status: "partial", score: 116 });
    expect(r.detail.rounds).toHaveLength(4);
    expect(r.detail.betterThan).toBeNull();
  });

  it("works from storage alone, with prompt ids and answer keys in place of the page's words", () => {
    const r = parseSpamle({ localStorage: win.localStorage ?? {} })!;
    expect(r).toMatchObject({ score: 146, status: "won", detail: { gumballs: 53, players: null, betterThan: null } });
    expect(r.detail.rounds[0]).toMatchObject({ promptId: "genres", prompt: null, possible: null, rating: null, great: null, top: null });
    expect(r.detail.rounds[0]!.answers[4]).toEqual({ answer: "westcoasthiphop", rarity: "rare", points: 3 });
  });

  it("ignores day totals unless today's board in the same page is for the record's day", () => {
    const stale = { ...win, responses: (win.responses ?? []).filter((x) => !/\/rest\/v1\/scores\?/.test(x.url)) };
    expect(parseSpamle(stale)!.detail.betterThan).toBeNull();
  });

  it("ignores a page snapshot taken on another day", () => {
    const other = { ...win, page: { spamle: { ...(win.page?.spamle as object), day: "2026-11-22" } } };
    expect(parseSpamle(other)!.detail.rounds[0]!.prompt).toBeNull();
  });

  it("skips Archive replays: only a day the Daily was played live counts", () => {
    const state = structuredClone(win.localStorage!["spamle-v1"]) as { days: Record<string, { live?: boolean }> };
    const replay = structuredClone(state.days["2026-11-23"]!);
    delete replay.live;
    state.days["2026-11-24"] = replay;
    expect(parseSpamle({ localStorage: { "spamle-v1": state } })?.date).toBe("2026-11-23");
  });

  it("has the game's rarity colors", () => {
    expect(SPAMLE_RARITIES.map((r) => r.color)).toEqual(["#b8b4c8", "#5ddc6a", "#7cc8ff", "#b06cff", "#ffd23f"]);
  });

  it("returns null with no Daily played", () => {
    expect(parseSpamle({})).toBeNull();
    expect(parseSpamle({ localStorage: { "spamle-v1": { mode: "daily", days: {}, prac: null } } })).toBeNull();
  });
});
