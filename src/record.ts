import { z } from "zod";
import type { Capture } from "./types";

/**
 * The record every parser emits:
 * `{game, date (the game's own day), puzzleNo, status: won|lost|partial, score, detail}`.
 * `detail` is specific to each game. Records hold words and numbers only, never share emoji.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hex = z.string().regex(/^#[0-9a-f]{6}$/);
const count = z.number().int().nonnegative();
const percent = z.number().min(0).max(100);

const base = <G extends string, D extends z.ZodType>(game: G, detail: D) =>
  z.strictObject({
    game: z.literal(game),
    date: day,
    puzzleNo: z.number().int().nullable(),
    status: z.enum(["won", "lost", "partial"]),
    score: z.number(),
    detail,
  });

export const KRILLION_TIER = z.enum(["plankton", "tooclever", "schooler", "rare", "deepcut", "krillion"]);

export const krillionRecord = base(
  "krillion",
  z.strictObject({
    answers: z
      .array(
        z.strictObject({
          prompt: z.string(),
          answer: z.string().nullable(),
          tier: KRILLION_TIER.nullable(),
          color: hex,
          points: count,
          /** This answer's share of all answers to the prompt, as a percentage; null for a miss. */
          sharePct: percent.nullable(),
        }),
      )
      .length(7),
    dist: z.array(count).optional(),
    betterThan: percent.optional(),
  }),
);

export const travleRecord = base(
  "travle",
  z.strictObject({
    guesses: z.array(z.strictObject({ country: z.string(), rating: z.enum(["perfect", "near-perfect", "good", "poor"]) })),
    par: count.nullable(),
    hints: count,
    perfect: z.boolean(),
    /** Countries still missing on a loss. */
    away: count.nullable(),
    optimalRoute: z.array(z.string()),
    topPercent: percent.nullable(),
    /** The game's 14 score buckets: index `t * 2 + (hints ? 1 : 0)`, t = failed, perfect, +0, +1, ... */
    distribution: z.array(count).nullable(),
  }),
);

export const encloseHorseRecord = base(
  "enclose-horse",
  z.strictObject({
    map: z.string(),
    cols: count,
    rows: count,
    walls: z.array(count),
    score: z.number().int(),
    optimal: z.number().int(),
    medal: z.enum(["perfect", "gold", "silver", "bronze"]),
    histogram: z.array(z.strictObject({ minScore: z.number(), maxScore: z.number(), count })).nullable(),
    rank: count.nullable(),
    percentile: percent.nullable(),
  }),
);

const letterMark = z.enum(["correct", "present", "absent"]);

export const wordleRecord = base(
  "wordle",
  z.strictObject({ guesses: z.array(z.string()), evaluations: z.array(z.array(letterMark)), hardMode: z.boolean() }),
);

export const connectionsRecord = base(
  "connections",
  z.strictObject({
    mistakes: count,
    /** Every guess in order; `levels` are the true groups, 0 yellow to 3 purple. */
    guesses: z.array(z.strictObject({ words: z.array(z.string()), levels: z.array(z.number().int().min(0).max(3)), correct: z.boolean() })),
    /** Levels of the groups the player found, in the order found. */
    solved: z.array(z.number().int().min(0).max(3)),
  }),
);

export const spellingBeeRecord = base(
  "spelling-bee",
  z.strictObject({
    words: z.array(z.string()),
    pangrams: z.array(z.string()),
    rank: z.string(),
    maxPoints: count.nullable(),
  }),
);

export const miniRecord = base("mini", z.strictObject({ timeSeconds: count.nullable() }));

export const globleRecord = base(
  "globle",
  z.strictObject({
    countries: z.array(z.string()),
    /** Closeness per guess, stored by the game only for a win. */
    heat: z.array(z.enum(["correct", "hot", "warm", "mild", "cold"])).nullable(),
    currentStreak: count,
    maxStreak: count,
  }),
);

export const songlessRecord = base(
  "songless",
  z.strictObject({
    categoryId: count,
    board: z.array(
      z.strictObject({
        state: z.enum(["correct", "present", "incorrect", "skipped"]),
        artist: z.string().nullable(),
        track: z.string().nullable(),
      }),
    ),
    answer: z.strictObject({ artist: z.string(), track: z.string() }).nullable(),
    topPercent: percent.nullable(),
    /** Relative weights for 1 to 5 attempts, then failed. */
    distribution: z.array(z.number().nonnegative()).nullable(),
  }),
);

export const SPAMLE_RARITY = z.enum(["common", "uncommon", "rare", "epic", "legendary"]);
/** Spamle's round ratings, lowest first: Warm-up, Not bad, Good, Great, Spamtastic. */
export const SPAMLE_RATING = z.enum(["warm-up", "not-bad", "good", "great", "spamtastic"]);

export const spamleRecord = base(
  "spamle",
  z.strictObject({
    /** Right answers across the finished rounds; each drops one gumball. */
    gumballs: count,
    /** Gumballs by rarity: Common, Uncommon, Rare, Epic, Legendary. */
    rarities: z.array(count).length(5),
    /** The Daily's finished rounds, in order. Words the page holds only in memory are null without its snapshot. */
    rounds: z
      .array(
        z.strictObject({
          promptId: z.string(),
          prompt: z.string().nullable(),
          /** How many answers the category accepts. */
          possible: count.nullable(),
          points: count,
          /** The category's Great and Spamtastic targets, in points. */
          great: count.nullable(),
          top: count.nullable(),
          rating: SPAMLE_RATING.nullable(),
          /** Bonus seconds banked, at most 10. */
          bonus: count,
          /** Answers typed that did not count. */
          misses: count,
          answers: z.array(z.strictObject({ answer: z.string(), rarity: SPAMLE_RARITY, points: z.number().int().min(1).max(5) })),
        }),
      )
      .max(5),
    /** Other players who finished today's Daily, as the game compares them; null until this Daily is finished. */
    players: count.nullable(),
    /** Share of those players this score beat, ties counting half. */
    betterThan: percent.nullable(),
    /** Everyone who finished, this player included, in 50-point buckets; the last is 450 and up. */
    distribution: z.array(count).length(10).nullable(),
  }),
);

export const RECORD = z.discriminatedUnion("game", [
  krillionRecord,
  travleRecord,
  encloseHorseRecord,
  wordleRecord,
  connectionsRecord,
  spellingBeeRecord,
  miniRecord,
  globleRecord,
  songlessRecord,
  spamleRecord,
]);

export type DailyRecord = z.infer<typeof RECORD>;
export type RecordOf<G extends DailyRecord["game"]> = Extract<DailyRecord, { game: G }>;
export type RecordParser<G extends DailyRecord["game"] = DailyRecord["game"]> = (capture: Capture) => RecordOf<G> | null;
