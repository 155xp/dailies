import type { DailyRecord } from "../../src/record";
import type { Game } from "./games";

/** "Played, not logged": the page showed a finished game but no record was written. */
export interface Miss {
  game: Game;
  date: string;
  reason: string;
  at: string;
}

/**
 * `chrome.storage.local`, per the shared contract: `records` and `misses` keyed by `${game}:${date}`,
 * `lastLogAt` an ISO string. `loggedAt` (same keys) is the time each record was first or last changed.
 */
export interface State {
  records: Record<string, DailyRecord>;
  misses: Record<string, Miss>;
  loggedAt: Record<string, string>;
  lastLogAt?: string;
}

export const STATE_KEYS = ["records", "misses", "loggedAt", "lastLogAt"] as const;

export const recordKey = (game: Game, date: string) => `${game}:${date}`;

/** Local calendar day, `YYYY-MM-DD`. */
export const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** The storage patch for a captured record, or null when it is already stored as is (a replay or reload). */
export function applyRecord(state: State, record: DailyRecord, now: Date): Partial<State> | null {
  const key = recordKey(record.game, record.date);
  if (same(state.records[key], record)) return null;
  const at = now.toISOString();
  const days = new Set([record.date, localDay(now)]);
  const misses = Object.fromEntries(Object.entries(state.misses).filter(([, m]) => !(m.game === record.game && days.has(m.date))));
  return {
    records: { ...state.records, [key]: record },
    misses,
    loggedAt: { ...state.loggedAt, [key]: at },
    lastLogAt: at,
  };
}

/** The storage patch for a miss, or null when that game and day is already logged or already missed. */
export function applyMiss(state: State, miss: Miss): Partial<State> | null {
  const key = recordKey(miss.game, miss.date);
  if (state.records[key] || state.misses[key]) return null;
  return { misses: { ...state.misses, [key]: miss } };
}
