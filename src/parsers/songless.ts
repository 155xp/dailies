import type { Parser } from "../types";
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
  gameData: { guesses: number; board: { state: string; artist?: string; track?: string }[] };
}

/** Distribution points are 1 to 5 attempts and 6 for failed; weights are relative. */
function topPercent(dist: { point: number; weight: number }[], point: number): number {
  const total = dist.reduce((n, d) => n + d.weight, 0);
  const atLeast = dist.filter((d) => d.point <= point).reduce((n, d) => n + d.weight, 0);
  return Math.round((atLeast / total) * 1000) / 10;
}

export const parseSongless: Parser = (capture) => {
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
  const number = capture.share?.match(/\[Songless #(\d+)\]/)?.[1];

  return {
    game: "songless",
    puzzleId: `${s.challengeDate}/${s.categoryId}`,
    ...(number && { puzzleNumber: Number(number) }),
    date: s.challengeDate,
    outcome: won ? "win" : "loss",
    score: s.gameData.guesses,
    scoreUnit: "attempts",
    maxScore: MAX_ATTEMPTS,
    guesses: s.gameData.board.map((b) => ({
      value: b.artist && b.track ? `${b.artist} - ${b.track}` : "",
      mark: b.state,
      color: SONGLESS_COLORS[b.state] ?? "",
    })),
    ...(dist && {
      topPercent: topPercent(dist, won ? s.gameData.guesses : MAX_ATTEMPTS + 1),
      distribution: dist.map((d) => ({ label: d.point > MAX_ATTEMPTS ? "failed" : String(d.point), count: d.weight })),
    }),
    ...(capture.share && { shareText: capture.share }),
  };
};
