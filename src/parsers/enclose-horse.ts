import type { Parser } from "../types";
import { findResponse, storageValue } from "./util";

/** Points for items inside the pen: cherry, golden apple, bee swarm. */
const ITEM_POINTS: Record<string, number> = { C: 3, G: 10, S: -5 };
const BLOCKED = new Set(["~", "W"]);

/**
 * Redo the game's flood fill: from the horse over 4-neighbours (same-label portals connect),
 * blocked by water, fixed walls and the player's walls. Reaching the border means the horse escapes.
 */
export function enclosure(map: string[], walls: number[]): { cells: number[]; score: number; escaped: boolean } {
  const cols = map[0]?.length ?? 0;
  const tiles = map.join("");
  const walled = new Set(walls);
  const start = tiles.indexOf("H");
  const seen = new Set<number>([start]);
  const queue = [start];
  let escaped = false;

  for (let cell = queue.shift(); cell !== undefined; cell = queue.shift()) {
    const row = Math.floor(cell / cols);
    const col = cell % cols;
    if (row === 0 || col === 0 || row === map.length - 1 || col === cols - 1) escaped = true;
    const next = [cell - cols, cell + cols, ...(col > 0 ? [cell - 1] : []), ...(col < cols - 1 ? [cell + 1] : [])];
    const tile = tiles[cell] ?? "";
    if (/[0-9a-z]/.test(tile)) next.push(...[...tiles].flatMap((t, i) => (t === tile && i !== cell ? [i] : [])));
    for (const n of next) {
      if (n < 0 || n >= tiles.length || seen.has(n) || walled.has(n) || BLOCKED.has(tiles[n] ?? "~")) continue;
      seen.add(n);
      queue.push(n);
    }
  }

  const cells = [...seen].sort((a, b) => a - b);
  const score = cells.reduce((sum, c) => sum + 1 + (ITEM_POINTS[tiles[c] ?? ""] ?? 0), 0);
  return { cells, score: escaped ? 0 : score, escaped };
}

/** The game's medal cut-offs, by share of the optimal score. */
export function medal(score: number, optimal: number): string {
  const pct = score >= optimal ? 100 : (score / optimal) * 100;
  return pct >= 100 ? "diamond" : pct >= 90 ? "gold" : pct >= 80 ? "silver" : "bronze";
}

interface Level {
  id: string;
  map: string;
  dailyDate: string;
  dayNumber: number;
  optimalScore: number;
}

interface Submitted {
  score: number;
  rank: number;
  percentile: number;
  stats: { histogram: { minScore: number; maxScore: number; count: number }[] };
}

export const parseEncloseHorse: Parser = (capture) => {
  const level = findResponse(capture, /\/api\/daily\/\d{4}-\d{2}-\d{2}$/)?.body as Level | undefined;
  const subs = storageValue(capture, "enclose_submissions") as Record<string, { walls: number[]; score: number }> | undefined;
  const mine = level && subs?.[level.id];
  if (!level || !mine) return null;

  const map = level.map.split("\n");
  const server = findResponse(capture, new RegExp(`/api/levels/${level.id}/submit$`))?.body as Submitted | undefined;

  return {
    game: "enclose-horse",
    puzzleId: level.id,
    puzzleNumber: level.dayNumber,
    date: level.dailyDate,
    outcome: mine.score >= level.optimalScore ? "win" : "partial",
    score: mine.score,
    scoreUnit: "points",
    maxScore: level.optimalScore,
    guesses: [],
    rankLabel: medal(mine.score, level.optimalScore),
    ...(server && {
      rank: server.rank,
      percentile: server.percentile,
      distribution: server.stats.histogram.map((b) => ({
        label: b.minScore === b.maxScore ? String(b.minScore) : `${b.minScore}-${b.maxScore}`,
        count: b.count,
      })),
    }),
    layout: {
      cols: map[0]?.length ?? 0,
      rows: map.length,
      map,
      placed: mine.walls,
      enclosed: enclosure(map, mine.walls).cells,
    },
    ...(capture.share && { shareText: capture.share }),
  };
};
