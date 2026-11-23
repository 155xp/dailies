import type { DailyRecord } from "../../src/record";
import { spamlePage } from "./spamle-page";

export type Game = DailyRecord["game"];

/**
 * Everything the extension knows about one game: where it runs and which of the game's own writes to watch.
 * Selectors come from the result screens in `fixtures/<game>/*\/dom.html`.
 */
export interface GameDef {
  id: Game;
  name: string;
  url: string;
  /** Content-script match patterns (design spec, Part 2). */
  matches: string[];
  /** localStorage keys whose writes trigger a read, and which the read includes. */
  keys?: RegExp;
  /** Response URLs the fetch hook copies. Everything else passes through untouched. */
  responses?: RegExp;
  /** An IndexedDB store the result lives in, read after an allowlisted response and at load. */
  indexedDB?: { db: string; store: string };
  /** Whether the parser reads the share text, caught when the player shares (clipboard or share sheet). */
  share?: boolean;
  /** Page globals the parser needs, forwarded by the MAIN-world hook. */
  globals?: string[];
  /**
   * Values the page keeps only in its own top-level bindings (not on `window`), read by the MAIN-world hook with
   * each storage write and once at load. Merged into the capture's `page` like `globals`.
   */
  pageState?: () => Record<string, unknown> | undefined;
  /** The rank node Spelling Bee updates on every word; the one MutationObserver target. */
  observe?: string;
  /** The game's result screen. Seen with no record, it becomes "played, not logged". */
  finished?: string;
  /** Whether a parsed record is a finished game rather than one still in progress. */
  done?: (record: DailyRecord) => boolean;
}

const decided = (r: DailyRecord) => r.status !== "partial";

export const GAMES: GameDef[] = [
  {
    id: "krillion",
    name: "Krillion",
    url: "https://krillion.io/",
    matches: ["https://krillion.io/*"],
    keys: /^krillion:stats:v1$/,
    responses: /^https:\/\/krillion\.io\/api\/(today\/complete|answer-popularity\?)/,
    finished: 'button[aria-label="Share via apps"]',
  },
  {
    id: "travle",
    name: "Travle",
    url: "https://travle.earth/",
    matches: ["https://travle.earth/*"],
    keys: /^travle-(game-state|past-games)$/,
    responses: /^https:\/\/auth\.teuteuf\.fr\/travle\/scores\/[^/]+$/,
    finished: "article.results-panel",
  },
  {
    id: "enclose-horse",
    name: "enclose.horse",
    url: "https://enclose.horse/",
    matches: ["https://enclose.horse/*"],
    keys: /^enclose_submissions$/,
    responses: /^https:\/\/api\.enclose\.horse\/api\/(daily\/\d{4}-\d{2}-\d{2}|levels\/[\w-]+\/submit)$/,
    finished: "#resultsOverlay.visible",
  },
  {
    id: "wordle",
    name: "Wordle",
    url: "https://www.nytimes.com/games/wordle/index.html",
    matches: ["https://www.nytimes.com/games/wordle/*"],
    keys: /^games-state-wordleV2\//,
    responses: /^https:\/\/www\.nytimes\.com\/svc\/wordle\/v2\/[\d-]+\.json$/,
    share: true,
    finished: '#stats-dialog, [class*="Footer-module_shareButton"]',
    // With no solution response and no share, guesses cannot be graded: that is a miss, not a record.
    done: (r) => decided(r) && r.game === "wordle" && r.detail.evaluations.every((row) => row.length === 5),
  },
  {
    id: "connections",
    name: "Connections",
    url: "https://www.nytimes.com/games/connections",
    matches: ["https://www.nytimes.com/games/connections*"],
    keys: /^games-state-connections(-collection)?\//,
    responses: /^https:\/\/www\.nytimes\.com\/svc\/connections\/v2\/[\d-]+\.json$/,
    // The puzzle number players see (#1260) is only in the share text; storage and API hold another id.
    share: true,
    finished: '[class*="Congrats-module_completionIcon"]',
    done: decided,
  },
  {
    id: "spelling-bee",
    name: "Spelling Bee",
    url: "https://www.nytimes.com/puzzles/spelling-bee",
    matches: ["https://www.nytimes.com/puzzles/spelling-bee*"],
    keys: /^games-state-spelling_bee\//,
    globals: ["gameData"],
    observe: '[data-testid="sb-progress"]',
  },
  {
    // Signed out the Mini is gated and saves nothing (fixtures/mini), so its parser returns null for now.
    id: "mini",
    name: "Mini Crossword",
    url: "https://www.nytimes.com/crosswords/game/mini",
    matches: ["https://www.nytimes.com/crosswords/game/mini*"],
    keys: /^games-state-crossword_mini(-collection)?\//,
  },
  {
    id: "globle",
    name: "Globle",
    url: "https://globle-game.com/",
    matches: ["https://globle-game.com/*"],
    keys: /^(guesses|statistics)$/,
    finished: 'button[data-i18n="Game2"][disabled]',
    // Globle has no loss: an unsolved day is still in progress.
    done: (r) => r.status === "won",
  },
  {
    id: "songless",
    name: "Songless",
    url: "https://lessgames.com/songless",
    matches: ["https://lessgames.com/songless*"],
    responses: /^https:\/\/api\.lessgames\.com\/songless\/stats\?/,
    indexedDB: { db: "game-store", store: "sessions" },
    finished: '[role="dialog"][data-state="open"] .chakra-stat__root',
  },
  {
    id: "spamle",
    name: "Spamle",
    url: "https://spamle.com/",
    matches: ["https://spamle.com/*"],
    keys: /^spamle-v1$/,
    // Today's board names the page's day; day_totals is every finisher's score, the game's TOP % and spread.
    responses: /^https:\/\/shgtowaowhafjyrbvpxh\.supabase\.co\/rest\/v1\/(rpc\/day_totals$|scores\?day=eq\.\d{4}-\d{2}-\d{2}&select=player_id,name,total,n,rounds&)/,
    // Prompt text, answer names and round targets exist only in the page's memory (extension/src/spamle-page.ts).
    pageState: spamlePage,
    // Only the finished Daily's screen has the hidden share box.
    finished: "#shareBox",
  },
];

/** Chrome match-pattern test for the `https://host/path*` patterns above. */
export function matchesPattern(pattern: string, url: string): boolean {
  const m = pattern.match(/^(https?):\/\/([^/]+)(\/.*)$/);
  if (!m) return false;
  const [, scheme, host, path] = m;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const glob = new RegExp(`^${path!.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
  return u.protocol === `${scheme}:` && u.host === host && glob.test(u.pathname + u.search);
}

export const gameForUrl = (url: string) => GAMES.find((g) => g.matches.some((p) => matchesPattern(p, url)));

export const allowResponse = (game: GameDef, url: string) => game.responses?.test(url) ?? false;
