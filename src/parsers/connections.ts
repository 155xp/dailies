import type { RecordParser } from "../record";
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

export const parseConnections: RecordParser<"connections"> = (capture) => {
  const state = nytState(capture, "connections");
  if (!state) return null;
  const data = state.data as {
    puzzleWon: boolean;
    puzzleComplete: boolean;
    mistakes: number;
    guesses: { cards: Card[]; correct: boolean }[];
    solvedCategories?: { level: number; orderSolved: number }[];
  };

  const puzzle = findResponse(capture, /\/svc\/connections\/v2\/[\d-]+\.json/)?.body as
    | { categories?: { cards: { content: string; position: number }[] }[] }
    | undefined;
  const words = new Map<number, string>();
  for (const cat of puzzle?.categories ?? []) for (const card of cat.cards) words.set(card.position, card.content);

  const number = capture.share?.match(/Puzzle #(\d+)/)?.[1];
  return {
    game: "connections",
    date: state.printDate,
    puzzleNo: number ? Number(number) : null,
    status: data.puzzleWon ? "won" : data.puzzleComplete ? "lost" : "partial",
    score: data.mistakes,
    detail: {
      mistakes: data.mistakes,
      guesses: data.guesses.map((g) => ({
        words: g.cards.map((c) => words.get(c.position) ?? String(c.position)),
        levels: g.cards.map((c) => c.level),
        correct: g.correct,
      })),
      solved: [...(data.solvedCategories ?? [])].sort((a, b) => a.orderSolved - b.orderSolved).map((c) => c.level),
    },
  };
};
