import type { DailyRecord } from "../../src/record";

export type GameId = DailyRecord["game"];

export interface Game {
  id: GameId;
  name: string;
  url: string;
  /** The game's primary result color, used only inside tiles and charts. */
  color: string;
}

/** Fixed display order. Rows never reorder by status. */
export const GAMES: readonly Game[] = [
  { id: "krillion", name: "Krillion", url: "https://krillion.io/", color: "#4de3ff" },
  { id: "travle", name: "Travle", url: "https://travle.earth/", color: "#7daea3" },
  { id: "enclose-horse", name: "enclose.horse", url: "https://enclose.horse/", color: "#cda857" },
  { id: "wordle", name: "Wordle", url: "https://www.nytimes.com/games/wordle/index.html", color: "#6aaa64" },
  { id: "connections", name: "Connections", url: "https://www.nytimes.com/games/connections", color: "#ba81c5" },
  { id: "spelling-bee", name: "Spelling Bee", url: "https://www.nytimes.com/puzzles/spelling-bee", color: "#f7da21" },
  { id: "mini", name: "Mini Crossword", url: "https://www.nytimes.com/crosswords/game/mini", color: "#95befa" },
  { id: "globle", name: "Globle", url: "https://globle-game.com/", color: "#008000" },
  { id: "songless", name: "Songless", url: "https://lessgames.com/songless", color: "#55b725" },
];

export const gameById = (id: GameId): Game => GAMES.find((g) => g.id === id)!;
