import { KRILLION_TIER, type RecordParser } from "../record";
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
  promptId: string;
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

/** `/api/answer-popularity` maps every accepted answer to a player count, per prompt. */
type Popularity = Record<string, Record<string, number>>;

function sharePct(popularity: Popularity | undefined, a: Answer): number | null {
  const counts = popularity?.[a.promptId];
  const count = a.answer && a.tier ? counts?.[a.answer] : undefined;
  if (!counts || count === undefined) return null;
  return (100 * count) / Object.values(counts).reduce((n, c) => n + c, 0);
}

export const parseKrillion: RecordParser<"krillion"> = (capture) => {
  const stats = storageValue(capture, "krillion:stats:v1") as
    | { lastPlayedDate?: string; history?: Record<string, Dive> }
    | undefined;
  const date = stats?.lastPlayedDate;
  const dive = date ? stats?.history?.[date] : undefined;
  if (!date || !dive) return null;

  const pop = findResponse(capture, new RegExp(`/api/answer-popularity\\?date=${date}$`))?.body as
    | { prompts?: Popularity }
    | undefined;
  const complete = findResponse(capture, /\/api\/today\/complete$/);
  const ranking =
    (complete?.requestBody as { date?: string } | undefined)?.date === date
      ? (complete?.body as { betterThan: number; dist: number[] })
      : undefined;

  const answers = dive.results.map((a) => {
    const tier = KRILLION_TIER.safeParse(a.tier).data ?? null;
    return {
      prompt: a.promptText,
      answer: a.answer ?? a.rawAnswer,
      tier,
      color: KRILLION_TIERS[tier ?? "miss"]!,
      points: a.score,
      sharePct: sharePct(pop?.prompts, a),
    };
  });

  return {
    game: "krillion",
    date,
    puzzleNo: dive.dayNumber,
    status: answers.every((a) => a.tier) ? "won" : "partial",
    score: dive.score,
    detail: { answers, ...(ranking && { dist: ranking.dist, betterThan: ranking.betterThan }) },
  };
};
