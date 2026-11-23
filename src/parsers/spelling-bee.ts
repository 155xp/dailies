import type { Parser } from "../types";
import { nytState } from "./util";

interface Today {
  id: number;
  printDate: string;
  answers: string[];
  pangrams: string[];
}

/** The game's scoring: 4 letters score 1, longer words their length, pangrams 7 more. */
export function wordPoints(word: string, isPangram: boolean): number {
  return (word.length === 4 ? 1 : word.length) + (isPangram ? 7 : 0);
}

export const parseSpellingBee: Parser = (capture) => {
  const state = nytState(capture, "spelling_bee");
  if (!state) return null;
  const { answers, rank } = state.data as { answers: string[]; rank: string };

  const today = (capture.page?.gameData as { today?: Today } | undefined)?.today;
  const matches = today && String(today.id) === state.puzzleId ? today : undefined;
  const pangrams = new Set(matches?.pangrams ?? []);
  const points = (w: string) => wordPoints(w, pangrams.has(w));

  const guesses = answers.map((w) => ({
    value: w,
    mark: pangrams.has(w) ? "pangram" : "word",
    points: points(w),
  }));
  const score = guesses.reduce((sum, g) => sum + g.points, 0);

  return {
    game: "spelling-bee",
    puzzleId: state.puzzleId,
    date: state.printDate,
    outcome: rank === "Queen Bee" ? "win" : "partial",
    score,
    scoreUnit: "points",
    ...(matches && { maxScore: matches.answers.reduce((sum, w) => sum + points(w), 0) }),
    guesses,
    rankLabel: rank,
    ...(capture.share && { shareText: capture.share }),
  };
};
