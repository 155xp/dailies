import type { CapturedResponse } from "../src/types";

/**
 * A guest Wordle win as QA saw it live (dailies#11): signed out, won in 2, no share. The page saves its state
 * under `games-state-wordleV2/ANON` and loads the day's solution JSON through XMLHttpRequest, not fetch.
 * The words are stand-ins; the day is a parameter so a replay can run on any day.
 */
export const LIVE_GUESSES = ["slate", "spelt"];
export const LIVE_SOLUTION = "spelt";
/** Wordle grades for the guesses above against the solution. */
export const LIVE_EVALUATIONS = [
  ["correct", "present", "absent", "present", "present"],
  ["correct", "correct", "correct", "correct", "correct"],
];
export const LIVE_KEY = "games-state-wordleV2/ANON";

/** Wordle No. 0 was 2021-06-19, so 2026-11-22 is No. 1982 (fixtures/wordle). */
export const wordleNumber = (day: string) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse("2021-06-19T00:00:00Z")) / 86_400_000);

export const solutionUrl = (day: string) => `https://www.nytimes.com/svc/wordle/v2/${day}.json`;

/** The solution JSON the page requests for `day`. */
export const solutionBody = (day: string) => ({
  id: wordleNumber(day) + 2841,
  solution: LIVE_SOLUTION,
  print_date: day,
  days_since_launch: wordleNumber(day),
  editor: "REDACTED",
});

/** The saved state after `guesses`, as the page writes it with `localStorage.setItem`. */
export function liveState(day: string, guesses: string[], status: "IN_PROGRESS" | "WIN" | "FAIL"): string {
  const boardState = Array.from({ length: 6 }, (_, i) => guesses[i] ?? "");
  return JSON.stringify({
    states: [
      {
        puzzleId: String(solutionBody(day).id),
        data: { boardState, currentRowIndex: guesses.length, status, hardMode: false, isPlayingArchive: false },
        schemaVersion: "0.52.0",
        timestamp: Math.floor(Date.parse(`${day}T15:00:00Z`) / 1000),
        printDate: day,
      },
    ],
  });
}

/** The finished game's storage, as the extension reads it from the page. */
export const liveStorage = (day: string) => ({ [LIVE_KEY]: liveState(day, LIVE_GUESSES, "WIN") });

/** The solution response as the page hook reports it. */
export const liveResponse = (day: string): CapturedResponse => ({ url: solutionUrl(day), method: "GET", status: 200, body: solutionBody(day) });

/** The record a live guest win must log: tile marks from the solution, the number from `days_since_launch`. */
export const liveRecord = (day: string) => ({
  game: "wordle" as const,
  date: day,
  puzzleNo: wordleNumber(day),
  status: "won" as const,
  score: LIVE_GUESSES.length,
  detail: { guesses: LIVE_GUESSES, evaluations: LIVE_EVALUATIONS, hardMode: false },
});
