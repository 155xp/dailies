import type { RecordParser } from "../record";
import { findResponse } from "./util";

/** Attempt row colors, from the game's computed board styles. */
export const SONGLESS_COLORS: Record<string, string> = {
  correct: "rgb(85, 183, 37)",
  present: "rgb(218, 195, 22)",
  incorrect: "rgb(198, 33, 33)",
  skipped: "rgb(48, 52, 54)",
};

const MAX_ATTEMPTS = 5;

interface Session {
  challengeDate: string;
  categoryId: number;
  timestamp: string;
  state: string;
  game: string;
  gameData: {
    guesses: number;
    board: { state: string; artist?: string; track?: string }[];
    answer?: { artist: string; track: string };
  };
}

/** Distribution points are 1 to 5 attempts and 6 for failed; weights are relative. */
function topPercent(dist: { point: number; weight: number }[], point: number): number {
  const total = dist.reduce((n, d) => n + d.weight, 0);
  const atLeast = dist.filter((d) => d.point <= point).reduce((n, d) => n + d.weight, 0);
  return Math.round((atLeast / total) * 1000) / 10;
}

/** Songless #1 was 2025-08-29, the first day in its archive (`network/archive-categories.json`). */
const FIRST_DAY = Date.UTC(2025, 7, 29);

type AttemptState = "correct" | "present" | "incorrect" | "skipped";

export const parseSongless: RecordParser<"songless"> = (capture) => {
  const sessions = (capture.indexedDB?.["game-store/sessions"] ?? []) as Session[];
  const s = sessions
    .filter((x) => x.game === "songless" && x.state !== "ongoing")
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .at(-1);
  if (!s) return null;

  const won = s.state === "won";
  const statsUrl = new RegExp(`/songless/stats\\?challengeDate=${s.challengeDate}&categoryId=${s.categoryId}$`);
  const stats = findResponse(capture, statsUrl)?.body as { daily?: { distribution: { point: number; weight: number }[] } } | undefined;
  const dist = stats?.daily?.distribution;

  return {
    game: "songless",
    date: s.challengeDate,
    puzzleNo: Math.round((Date.parse(s.challengeDate) - FIRST_DAY) / 86_400_000) + 1,
    status: won ? "won" : "lost",
    score: s.gameData.guesses,
    detail: {
      categoryId: s.categoryId,
      board: s.gameData.board.map((b) => ({ state: b.state as AttemptState, artist: b.artist ?? null, track: b.track ?? null })),
      answer: s.gameData.answer ? { artist: s.gameData.answer.artist, track: s.gameData.answer.track } : null,
      topPercent: dist ? topPercent(dist, won ? s.gameData.guesses : MAX_ATTEMPTS + 1) : null,
      distribution: dist ? dist.map((d) => d.weight) : null,
    },
  };
};
