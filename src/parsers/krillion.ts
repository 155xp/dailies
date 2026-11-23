import type { Parser } from "../types";
import { findResponse, storageValue } from "./util";

/** Tier colors from the game's CSS (`--tier-<tier>` on `:root`), default palette. */
export const KRILLION_TIERS: Record<string, string> = {
  plankton: "#8fa3c4",
  schooler: "#4de3ff",
  rare: "#ff5252",
  deepcut: "#9d7bff",
  krillion: "#ffd166",
  tooclever: "#ff9f43",
  miss: "#3d4f6e",
};

interface Answer {
  promptText: string;
  rawAnswer: string | null;
  answer: string | null;
  tier: string | null;
  score: number;
}

interface Dive {
  dayNumber: number;
  score: number;
  results: Answer[];
}

export const parseKrillion: Parser = (capture) => {
  const stats = storageValue(capture, "krillion:stats:v1") as
    | { lastPlayedDate?: string; history?: Record<string, Dive> }
    | undefined;
  const date = stats?.lastPlayedDate;
  const dive = date ? stats?.history?.[date] : undefined;
  if (!date || !dive) return null;

  const guesses = dive.results.map((a) => {
    const mark = a.tier ?? "miss";
    return {
      prompt: a.promptText,
      value: a.answer ?? a.rawAnswer ?? "",
      mark,
      color: KRILLION_TIERS[mark] ?? KRILLION_TIERS.miss!,
      points: a.score,
    };
  });

  const complete = findResponse(capture, /\/api\/today\/complete$/);
  const sent = complete?.requestBody as { date?: string } | undefined;
  const ranking = sent?.date === date ? (complete?.body as { betterThan: number; dist: number[] }) : undefined;

  return {
    game: "krillion",
    puzzleId: date,
    puzzleNumber: dive.dayNumber,
    date,
    outcome: guesses.every((g) => g.mark !== "miss") ? "win" : "partial",
    score: dive.score,
    scoreUnit: "points",
    maxScore: dive.results.length * 100,
    guesses,
    ...(ranking && {
      percentile: ranking.betterThan,
      distribution: ranking.dist.map((count, i) => ({ label: String(i), count })),
    }),
    ...(capture.share && { shareText: capture.share }),
  };
};
