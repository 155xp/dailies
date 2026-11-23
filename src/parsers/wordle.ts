import type { Mark, Parser } from "../types";
import { findResponse, nytState } from "./util";

/** Tile colors from the game's CSS (`--color-correct`, `--color-present`, `--color-absent`), light mode. */
export const WORDLE_COLORS: Record<string, string> = {
  correct: "#6aaa64",
  present: "#c9b458",
  absent: "#787c7e",
};

const SQUARE: Record<string, string> = { "🟩": "correct", "🟨": "present", "⬜": "absent", "⬛": "absent" };

/** Grade a guess the way Wordle does: greens first, then yellows limited by remaining letter counts. */
export function grade(guess: string, solution: string): string[] {
  const marks: string[] = [...guess].map((c, i) => (solution[i] === c ? "correct" : "absent"));
  const left = new Map<string, number>();
  [...solution].forEach((c, i) => {
    if (marks[i] !== "correct") left.set(c, (left.get(c) ?? 0) + 1);
  });
  [...guess].forEach((c, i) => {
    const n = left.get(c) ?? 0;
    if (marks[i] !== "correct" && n > 0) {
      marks[i] = "present";
      left.set(c, n - 1);
    }
  });
  return marks;
}

function shareRows(share: string | undefined): string[][] {
  return (share ?? "")
    .split("\n")
    .filter((l) => /^[🟩🟨⬜⬛]{5}$/u.test(l))
    .map((l) => [...l].map((c) => SQUARE[c] ?? "absent"));
}

export const parseWordle: Parser = (capture) => {
  const state = nytState(capture, "wordleV2");
  if (!state) return null;
  const { boardState, status } = state.data as { boardState: string[]; status: string };
  const words = boardState.filter(Boolean);

  const puzzle = findResponse(capture, /\/svc\/wordle\/v2\/[\d-]+\.json/)?.body as
    | { solution?: string; days_since_launch?: number }
    | undefined;
  const fromShare = shareRows(capture.share);
  const shareNumber = capture.share?.match(/^Wordle ([\d,]+)/)?.[1]?.replace(/,/g, "");

  const guesses = words.map((word, i) => {
    const marks = puzzle?.solution ? grade(word, puzzle.solution) : fromShare[i];
    const parts: Mark[] | undefined = marks?.map((mark, j) => ({
      value: word[j] ?? "",
      mark,
      color: WORDLE_COLORS[mark] ?? "",
    }));
    const solved = marks ? marks.every((m) => m === "correct") : status === "WIN" && i === words.length - 1;
    return { value: word, mark: solved ? "correct" : "incorrect", ...(parts && { parts }) };
  });

  const number = puzzle?.days_since_launch ?? (shareNumber ? Number(shareNumber) : undefined);
  return {
    game: "wordle",
    puzzleId: state.puzzleId,
    ...(number !== undefined && { puzzleNumber: number }),
    date: state.printDate,
    outcome: status === "WIN" ? "win" : status === "FAIL" ? "loss" : "partial",
    score: words.length,
    scoreUnit: "guesses",
    maxScore: 6,
    guesses,
    ...(capture.share && { shareText: capture.share }),
  };
};
