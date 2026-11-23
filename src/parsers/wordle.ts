import type { RecordParser } from "../record";
import { findResponse, nytState } from "./util";

/** Tile colors from the game's CSS (`--color-correct`, `--color-present`, `--color-absent`), light mode. */
export const WORDLE_COLORS: Record<string, string> = {
  correct: "#6aaa64",
  present: "#c9b458",
  absent: "#787c7e",
};

type LetterMark = "correct" | "present" | "absent";

const SQUARE: Record<string, LetterMark> = { "🟩": "correct", "🟨": "present", "⬜": "absent", "⬛": "absent" };

/** Grade a guess the way Wordle does: greens first, then yellows limited by remaining letter counts. */
export function grade(guess: string, solution: string): LetterMark[] {
  const marks: LetterMark[] = [...guess].map((c, i) => (solution[i] === c ? "correct" : "absent"));
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

function shareRows(share: string | undefined): LetterMark[][] {
  return (share ?? "")
    .split("\n")
    .filter((l) => /^[🟩🟨⬜⬛]{5}$/u.test(l))
    .map((l) => [...l].map((c) => SQUARE[c] ?? "absent"));
}

export const parseWordle: RecordParser<"wordle"> = (capture) => {
  const state = nytState(capture, "wordleV2");
  if (!state) return null;
  const { boardState, status, hardMode } = state.data as { boardState: string[]; status: string; hardMode?: boolean };
  const guesses = boardState.filter(Boolean);

  const puzzle = findResponse(capture, /\/svc\/wordle\/v2\/[\d-]+\.json/)?.body as
    | { solution?: string; days_since_launch?: number }
    | undefined;
  const fromShare = shareRows(capture.share);
  const shareNumber = capture.share?.match(/^Wordle ([\d,]+)/)?.[1]?.replace(/,/g, "");
  const evaluations = guesses.map((word, i) => (puzzle?.solution ? grade(word, puzzle.solution) : (fromShare[i] ?? [])));

  return {
    game: "wordle",
    date: state.printDate,
    puzzleNo: puzzle?.days_since_launch ?? (shareNumber ? Number(shareNumber) : null),
    status: status === "WIN" ? "won" : status === "FAIL" ? "lost" : "partial",
    score: guesses.length,
    detail: { guesses, evaluations, hardMode: hardMode ?? false },
  };
};
