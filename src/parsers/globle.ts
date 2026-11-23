import type { Parser } from "../types";
import { storageValue } from "./util";

/**
 * Heat buckets, from the share emoji: closest-border distance as a share of 15,000 km.
 * The exact globe color is not stored; the game recomputes it from map data.
 */
const HEAT: Record<string, string> = {
  "🟩": "correct",
  "🟥": "hot",
  "🟧": "warm",
  "🟨": "mild",
  "⬜": "cold",
};

interface Stats {
  lastWinPuzzleDate?: string;
  emojiGuesses?: string;
}

export const parseGloble: Parser = (capture) => {
  const today = storageValue(capture, "guesses") as { day: string; countries: string[] } | undefined;
  if (!today?.countries?.length) return null;
  const stats = storageValue(capture, "statistics") as Stats | undefined;
  const won = stats?.lastWinPuzzleDate === today.day;
  const heat = won ? [...(stats?.emojiGuesses ?? "").replace(/\s/g, "")].map((c) => HEAT[c] ?? "guess") : [];

  return {
    game: "globle",
    puzzleId: today.day,
    date: today.day,
    outcome: won ? "win" : "partial",
    score: today.countries.length,
    scoreUnit: "guesses",
    guesses: today.countries.map((name, i) => ({ value: name, mark: heat[i] ?? "guess" })),
    ...(capture.share && { shareText: capture.share }),
  };
};
