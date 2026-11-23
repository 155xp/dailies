import { SPAMLE_RARITY, SPAMLE_RATING, type RecordOf, type RecordParser } from "../record";
import type { Capture } from "../types";
import { findResponse, storageValue } from "./util";

/** Daily #1 was this Eastern day; the number counts days from it (`dayNo` in the page). */
const EPOCH = Date.UTC(2026, 10, 11);
export const SPAMLE_ROUNDS = 5;

/** Rarity by points (1 to 5) and the game's colors for it (`RAR` and `.r1`-`.r5`, fixtures/spamle/win-2026-11-23/colors.json). */
export const SPAMLE_RARITIES = [
  { id: "common", name: "Common", color: "#b8b4c8", shade: "#7d7894" },
  { id: "uncommon", name: "Uncommon", color: "#5ddc6a", shade: "#2f9a3c" },
  { id: "rare", name: "Rare", color: "#7cc8ff", shade: "#3484c4" },
  { id: "epic", name: "Epic", color: "#b06cff", shade: "#6e34b8" },
  { id: "legendary", name: "Legendary", color: "#ffd23f", shade: "#d9a400" },
] as const;

/** Round ratings, lowest first, and the game's colors for them (`--t0`-`--t4`). */
export const SPAMLE_RATINGS = [
  { id: "warm-up", name: "Warm-up", color: "#8e88c9" },
  { id: "not-bad", name: "Not bad", color: "#ffd23f" },
  { id: "good", name: "Good", color: "#ff9f1c" },
  { id: "great", name: "Great", color: "#5dffb0" },
  { id: "spamtastic", name: "Spamtastic", color: "#b18cff" },
] as const;

/** One round as `spamle-v1` saves it: prompt id, accepted answer keys and their points, typed misses. */
interface Round {
  p: string;
  g?: string[];
  s?: number[];
  w?: string[];
  done?: boolean;
  bonus?: number;
}

interface Day {
  rounds?: Round[];
  /** Set when a round of the Daily is finished live; Archive replays and rounds copied from another device lack it. */
  live?: boolean;
}

/** What the hook reads from the page's memory (extension/src/spamle-page.ts). */
export interface SpamleSnapshot {
  day: string;
  prompts: Record<string, { q: string; possible: number; targets: { ok: number; good: number; great: number; top: number }; names: Record<string, string> }>;
}

const dayNo = (date: string) => {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round((Date.UTC(y!, m! - 1, d!) - EPOCH) / 864e5) + 1;
};

/** The game's `rate()`: the first target the round's points reach, from the top. */
function rating(points: number, t: SpamleSnapshot["prompts"][string]["targets"]) {
  const i = points >= t.top ? 4 : points >= t.great ? 3 : points >= t.good ? 2 : points >= t.ok ? 1 : 0;
  return SPAMLE_RATING.options[i]!;
}

/** The game's `pctInfo()` and `pctSpread()` inputs, only for a finished Daily and only from this page's own day. */
function standing(capture: Capture, date: string, score: number) {
  const board = findResponse(capture, /\/rest\/v1\/scores\?day=eq\.\d{4}-\d{2}-\d{2}&select=player_id,name,total,n,rounds&/);
  const totals = findResponse(capture, /\/rest\/v1\/rpc\/day_totals$/)?.body;
  // day_totals takes no day: it is the page's own day, which the board call names.
  if (!board?.url.includes(`day=eq.${date}&`) || !Array.isArray(totals) || !totals.every((t) => typeof t === "number")) return null;
  const others = totals as number[];
  const below = others.filter((t) => t < score).length;
  const same = others.filter((t) => t === score).length;
  const distribution = Array<number>(10).fill(0);
  for (const t of [...others, score]) distribution[Math.min(9, Math.floor(Math.max(0, t) / 50))]!++;
  return { players: others.length, betterThan: others.length ? ((below + same / 2) / others.length) * 100 : null, distribution };
}

export const parseSpamle: RecordParser<"spamle"> = (capture) => {
  const state = storageValue(capture, "spamle-v1") as { days?: Record<string, Day> } | undefined;
  const days = state?.days ?? {};
  const date = Object.keys(days)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && days[k]!.live && days[k]!.rounds?.some((r) => r.done))
    .sort()
    .at(-1);
  if (!date) return null;
  const played = days[date]!.rounds!.filter((r) => r.done).slice(0, SPAMLE_ROUNDS);
  // Every accepted answer saves its points; a round without them cannot be scored.
  if (played.some((r) => (r.g ?? []).length !== (r.s ?? []).length || (r.s ?? []).some((s) => !(s >= 1 && s <= 5)))) return null;

  const snap = capture.page?.spamle as SpamleSnapshot | undefined;
  const page = snap?.day === date ? snap.prompts : {};
  const rounds: RecordOf<"spamle">["detail"]["rounds"] = played.map((r) => {
    const p = page[r.p];
    const answers = (r.g ?? []).map((key, i) => ({ answer: p?.names[key] ?? key, rarity: SPAMLE_RARITY.options[r.s![i]! - 1]!, points: r.s![i]! }));
    const points = answers.reduce((n, a) => n + a.points, 0);
    return {
      promptId: r.p,
      prompt: p?.q ?? null,
      possible: p?.possible ?? null,
      points,
      great: p?.targets.great ?? null,
      top: p?.targets.top ?? null,
      rating: p ? rating(points, p.targets) : null,
      bonus: Math.max(0, Math.round(r.bonus ?? 0)),
      misses: (r.w ?? []).length,
      answers,
    };
  });

  const score = rounds.reduce((n, r) => n + r.points, 0);
  const complete = played.length === SPAMLE_ROUNDS;
  const rank = complete ? standing(capture, date, score) : null;
  const rarities = [1, 2, 3, 4, 5].map((pts) => rounds.reduce((n, r) => n + r.answers.filter((a) => a.points === pts).length, 0));

  return {
    game: "spamle",
    date,
    puzzleNo: dayNo(date),
    // No win or loss: the whole Daily played is "won", fewer rounds "partial" (as Krillion's full dive).
    status: complete ? "won" : "partial",
    score,
    detail: {
      gumballs: rarities.reduce((a, b) => a + b, 0),
      rarities,
      rounds,
      players: rank?.players ?? null,
      betterThan: rank?.betterThan ?? null,
      distribution: rank?.distribution ?? null,
    },
  };
};
