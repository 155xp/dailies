import type { Guess, Parser } from "../types";
import { findResponse, nytState } from "./util";

/** Group level 0 to 3, easiest to hardest, as the game names and paints them (`--connections-*`). */
export const CONNECTIONS_LEVELS = [
  { mark: "yellow", color: "#f9df6d" },
  { mark: "green", color: "#a0c35a" },
  { mark: "blue", color: "#b0c4ef" },
  { mark: "purple", color: "#ba81c5" },
] as const;

interface Card {
  position: number;
  level: number;
}

function verdict(cards: Card[], correct: boolean): string {
  if (correct) return "correct";
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.level, (counts.get(c.level) ?? 0) + 1);
  return Math.max(...counts.values()) === 3 ? "one away" : "incorrect";
}

export const parseConnections: Parser = (capture) => {
  const state = nytState(capture, "connections");
  if (!state) return null;
  const data = state.data as { puzzleWon: boolean; puzzleComplete: boolean; mistakes: number; guesses: { cards: Card[]; correct: boolean }[] };

  const puzzle = findResponse(capture, /\/svc\/connections\/v2\/[\d-]+\.json/)?.body as
    | { categories?: { cards: { content: string; position: number }[] }[] }
    | undefined;
  const words = new Map<number, string>();
  for (const cat of puzzle?.categories ?? []) for (const card of cat.cards) words.set(card.position, card.content);

  const guesses: Guess[] = data.guesses.map((g) => {
    const parts = g.cards.map((c) => ({
      value: words.get(c.position) ?? String(c.position),
      ...CONNECTIONS_LEVELS[c.level]!,
    }));
    return { value: parts.map((p) => p.value).join(", "), mark: verdict(g.cards, g.correct), parts };
  });

  const number = capture.share?.match(/Puzzle #(\d+)/)?.[1];
  return {
    game: "connections",
    puzzleId: state.puzzleId,
    ...(number && { puzzleNumber: Number(number) }),
    date: state.printDate,
    outcome: data.puzzleWon ? "win" : data.puzzleComplete ? "loss" : "partial",
    score: data.mistakes,
    scoreUnit: "mistakes",
    maxScore: 4,
    guesses,
    ...(capture.share && { shareText: capture.share }),
  };
};
