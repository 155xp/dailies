import type { DailyRecord } from "../../src/record";
import { CONNECTIONS_LEVELS } from "../../src/parsers/connections";
import { SONGLESS_COLORS } from "../../src/parsers/songless";
import { SPAMLE_RATINGS, SPAMLE_ROUNDS } from "../../src/parsers/spamle";
import { WORDLE_COLORS } from "../../src/parsers/wordle";
import { gameById } from "./games";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The short result shown in a row and in history tooltips. */
export function result(r: DailyRecord): string {
  switch (r.game) {
    case "krillion":
      return `${r.score} points`;
    case "travle":
      if (r.detail.perfect) return "Perfect";
      return r.status === "won" ? `+${r.detail.guesses.length - (r.detail.par ?? r.detail.guesses.length)}` : `${r.detail.away ?? 0} away`;
    case "enclose-horse":
      return `${r.detail.score} of ${r.detail.optimal}`;
    case "wordle":
      return r.status === "won" ? `${r.detail.guesses.length}/6` : "X/6";
    case "connections":
      return plural(r.detail.mistakes, "mistake");
    case "spelling-bee":
      return r.detail.rank;
    case "mini": {
      const t = r.detail.timeSeconds;
      return t === null ? "Solved" : `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
    }
    case "globle":
      return plural(r.detail.countries.length, "guess", "guesses");
    case "songless":
      return r.status === "won" ? `Got it on try ${r.detail.board.length}` : "Missed";
    case "spamle":
      return r.status === "won" ? `${r.score} points` : `${r.score} points, ${r.detail.rounds.length} of ${SPAMLE_ROUNDS} rounds`;
  }
}

/** Travle stores ratings as emoji, not CSS; these are the four rating roles (on route, near, detour, far). */
const TRAVLE = { perfect: "#55b725", "near-perfect": "#9ccc65", good: "#f0a243", poor: "#d9534f" } as const;
/** Globle's own light-theme fills at each heat bucket (fixtures/globle/win-2026-11-22/colors.json). */
const GLOBLE = { correct: "#008000", hot: "#df432e", warm: "#f16e4a", mild: "#fdbe87", cold: "#fee4c0" } as const;
/** enclose.horse result band by medal (docs/games.md). */
const MEDAL = { perfect: "#d4f4ff", gold: "#fff0b3", silver: "#e0e0e0", bronze: "#e8d4c4" } as const;
const BEE_RANKS = ["Beginner", "Good Start", "Moving Up", "Good", "Solid", "Nice", "Great", "Amazing", "Genius"];
const MAX_TILES = 10;

/** The mini tile strip for a played row, in the game's own colors. */
export function tiles(r: DailyRecord): string[] {
  const all = ((): string[] => {
    switch (r.game) {
      case "krillion":
        return r.detail.answers.map((a) => a.color);
      case "travle":
        return r.detail.guesses.map((g) => TRAVLE[g.rating]);
      case "enclose-horse":
        return [MEDAL[r.detail.medal]];
      case "wordle":
        return r.detail.evaluations.map((row) =>
          WORDLE_COLORS[row.every((m) => m === "correct") ? "correct" : row.some((m) => m !== "absent") ? "present" : "absent"]!,
        );
      case "connections":
        return r.detail.guesses.map((g) => (g.correct ? CONNECTIONS_LEVELS[g.levels[0]!]!.color : WORDLE_COLORS.absent!));
      case "spelling-bee": {
        const reached = BEE_RANKS.indexOf(r.detail.rank);
        return BEE_RANKS.map((_, i) => (i <= reached ? "#f7da21" : "#ebebeb"));
      }
      case "mini":
        return [gameById("mini").color];
      case "globle":
        return (r.detail.heat ?? []).map((h) => GLOBLE[h]);
      case "songless":
        return r.detail.board.map((b) => SONGLESS_COLORS[b.state]!);
      case "spamle":
        // One tile per round in its rating color, as the game's own row of squares; the game color with no rating.
        return r.detail.rounds.map((x) => SPAMLE_RATINGS.find((t) => t.id === x.rating)?.color ?? gameById("spamle").color);
    }
  })();
  return all.slice(0, MAX_TILES);
}
