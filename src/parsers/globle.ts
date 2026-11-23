import type { RecordParser } from "../record";
import { storageValue } from "./util";

type Heat = "correct" | "hot" | "warm" | "mild" | "cold";

/**
 * Heat buckets, from the game's emoji grid: closest-border distance as a share of 15,000 km.
 * The exact globe color is not stored; the game recomputes it from map data.
 */
const HEAT: Record<string, Heat> = {
  "🟩": "correct",
  "🟥": "hot",
  "🟧": "warm",
  "🟨": "mild",
  "⬜": "cold",
};

interface Stats {
  lastWinPuzzleDate?: string;
  emojiGuesses?: string;
  currentStreak?: number;
  maxStreak?: number;
}

export const parseGloble: RecordParser<"globle"> = (capture) => {
  const today = storageValue(capture, "guesses") as { day: string; countries: string[] } | undefined;
  if (!today?.countries?.length) return null;
  const stats = storageValue(capture, "statistics") as Stats | undefined;
  const won = stats?.lastWinPuzzleDate === today.day;
  const heat = [...(stats?.emojiGuesses ?? "").replace(/\s/g, "")].map((c) => HEAT[c]);

  return {
    game: "globle",
    date: today.day,
    puzzleNo: null,
    status: won ? "won" : "partial",
    score: today.countries.length,
    detail: {
      countries: today.countries,
      heat: won && heat.length === today.countries.length && heat.every(Boolean) ? (heat as Heat[]) : null,
      currentStreak: stats?.currentStreak ?? 0,
      maxStreak: stats?.maxStreak ?? 0,
    },
  };
};
