import { PARSERS } from "../src/parsers";
import type { DailyRecord } from "../src/record";
import { loadCapture } from "../test/capture";

/**
 * The fixture case each card preview draws from. The Mini has no captured result (it is gated signed out,
 * `fixtures/mini`), so it has no case here and the preview leaves it out rather than invent one.
 */
export const FIXTURE_CASES: Partial<Record<DailyRecord["game"], string>> = {
  krillion: "win-2026-11-22",
  travle: "win-2026-11-22",
  "enclose-horse": "win-2026-11-22",
  wordle: "win-2026-11-22",
  connections: "win-2026-11-22",
  "spelling-bee": "partial-paywall-2026-11-22",
  globle: "win-2026-11-22",
  songless: "win-2026-11-22",
  spamle: "win-2026-11-23",
};

/** Parse one fixture case with the real parser. */
export function fixtureRecord<G extends DailyRecord["game"]>(game: G, dir: string): Extract<DailyRecord, { game: G }> {
  const record = PARSERS[game](loadCapture(game, dir));
  if (!record) throw new Error(`no record for ${game}/${dir}`);
  return record as Extract<DailyRecord, { game: G }>;
}

export const fixtureRecords = (): DailyRecord[] =>
  Object.entries(FIXTURE_CASES).map(([game, dir]) => fixtureRecord(game as DailyRecord["game"], dir!));
