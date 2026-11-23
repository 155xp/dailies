import type { RecordParser } from "../record";
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

export const parseSpellingBee: RecordParser<"spelling-bee"> = (capture) => {
  const state = nytState(capture, "spelling_bee");
  if (!state) return null;
  const { answers, rank } = state.data as { answers: string[]; rank: string };

  const today = (capture.page?.gameData as { today?: Today } | undefined)?.today;
  const matches = today && String(today.id) === state.puzzleId ? today : undefined;
  const pangrams = new Set(matches?.pangrams ?? []);
  const points = (w: string) => wordPoints(w, pangrams.has(w));

  return {
    game: "spelling-bee",
    date: state.printDate,
    puzzleNo: Number(state.puzzleId),
    status: rank === "Queen Bee" ? "won" : "partial",
    score: answers.reduce((sum, w) => sum + points(w), 0),
    detail: {
      words: answers,
      pangrams: answers.filter((w) => pangrams.has(w)),
      rank,
      maxPoints: matches ? matches.answers.reduce((sum, w) => sum + points(w), 0) : null,
    },
  };
};
