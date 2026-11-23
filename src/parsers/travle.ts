import type { RecordParser } from "../record";
import { findResponse, storageValue } from "./util";

type Rating = "perfect" | "near-perfect" | "good" | "poor";

/** The game rates each guess with an emoji (stored in `guessRatings`), not a CSS color. */
const RATING: Record<string, Rating> = {
  "✅": "perfect",
  "🟩": "near-perfect",
  "🟧": "good",
  "🟥": "poor",
};

/** Daily #1 was 2022-12-15; derived from #1439 being 2026-11-22 in the fixtures. */
const FIRST_DAY = Date.UTC(2022, 11, 15);

export function travleDate(puzzle: number): string {
  return new Date(FIRST_DAY + (puzzle - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** Share of same-hint-group players who did as well or better, as the result chart shows it. */
function topPercent(scores: number[], own: number): number {
  const group = scores.map((count, i) => ({ count, i })).filter(({ i }) => i % 2 === own % 2);
  const rankOf = (i: number) => (Math.floor(i / 2) === 0 ? Infinity : Math.floor(i / 2));
  const total = group.reduce((n, b) => n + b.count, 0);
  const atLeast = group.filter(({ i }) => rankOf(i) <= rankOf(own)).reduce((n, b) => n + b.count, 0);
  return Math.floor((atLeast / total) * 100);
}

interface State {
  puzzleIx: number;
  pastGuessIds: string[];
  guessRatings: string[];
  gameProgress: string;
  hintsData: unknown[];
  perfect: boolean;
  gameSummary?: { guessesNeededToSolve?: string[]; optimalSolution?: string[] };
}

export const parseTravle: RecordParser<"travle"> = (capture) => {
  const state = storageValue(capture, "travle-game-state") as State | undefined;
  if (!state || state.gameProgress === "ongoing") return null;
  const past = storageValue(capture, "travle-past-games") as { games?: { gameId: number; minGuesses: number }[] } | undefined;
  const summary = past?.games?.find((g) => g.gameId === state.puzzleIx);

  const won = state.gameProgress === "won";
  const hints = state.hintsData.length;
  const extra = summary ? state.pastGuessIds.length - summary.minGuesses : undefined;
  // The player's bucket, `t * 2 + (hints ? 1 : 0)` with t = failed, perfect, +0, +1, ...; unknown for a win without par.
  const t = !won ? 0 : extra === undefined ? undefined : state.perfect && extra === 0 ? 1 : 2 + extra;
  const own = t === undefined ? undefined : t * 2 + (hints ? 1 : 0);
  const scores = (findResponse(capture, /travle\/scores\/[^/]+$/, "GET")?.body as { scores?: number[] } | undefined)?.scores;

  return {
    game: "travle",
    date: travleDate(state.puzzleIx),
    puzzleNo: state.puzzleIx,
    status: won ? "won" : "lost",
    score: state.pastGuessIds.length,
    detail: {
      guesses: state.pastGuessIds.map((country, i) => ({ country, rating: RATING[state.guessRatings[i] ?? ""] ?? "poor" })),
      par: summary?.minGuesses ?? null,
      hints,
      perfect: state.perfect,
      away: won ? null : (state.gameSummary?.guessesNeededToSolve?.length ?? null),
      optimalRoute: state.gameSummary?.optimalSolution ?? [],
      topPercent: scores && own !== undefined ? topPercent(scores, own) : null,
      distribution: scores ?? null,
    },
  };
};
