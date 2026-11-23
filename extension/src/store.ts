/// <reference types="chrome" />
import type { DailyRecord } from "../../src/record";
import { GAMES, type Game, type GameDef } from "./games";

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

/** Deep equality that ignores key order: chrome.storage hands objects back with their keys sorted. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/**
 * `next` with every gap filled from `prev`: a null, a missing optional field or an empty list keeps the earlier
 * value. A reload reads storage before the game's own API answers, so it can see less than the first capture.
 */
function fill(next: unknown, prev: unknown): unknown {
  if (next === null || next === undefined) return prev ?? next;
  if (Array.isArray(next)) {
    if (!Array.isArray(prev)) return next;
    if (!next.length) return prev;
    return next.length === prev.length ? next.map((v, i) => fill(v, prev[i])) : next;
  }
  if (typeof next === "object" && prev && typeof prev === "object" && !Array.isArray(prev)) {
    const out: Record<string, unknown> = { ...(prev as Record<string, unknown>) };
    for (const [k, v] of Object.entries(next)) out[k] = fill(v, (prev as Record<string, unknown>)[k]);
    return out;
  }
  return next;
}

/** The storage patch for a captured record, or null when it adds nothing to what is stored (a replay or reload). */
export function applyRecord(state: State, captured: DailyRecord, now: Date, atLoad = false): Partial<State> | null {
  const key = recordKey(captured.game, captured.date);
  const prev = state.records[key];
  // A read at page load runs before the game fetches its own data, so it only fills gaps in a stored record.
  const record = !prev ? captured : ((atLoad ? fill(prev, captured) : fill(captured, prev)) as DailyRecord);
  if (same(prev, record)) return null;
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

/**
 * The storage patch for a miss, or null when that game and day is already missed, or the game already has a
 * record for that day or one logged that day (a game's own day can lag the local one).
 */
export function applyMiss(state: State, miss: Miss): Partial<State> | null {
  const key = recordKey(miss.game, miss.date);
  const loggedThatDay = Object.entries(state.records).some(
    ([k, r]) => r.game === miss.game && (r.date === miss.date || (!!state.loggedAt[k] && localDay(new Date(state.loggedAt[k])) === miss.date)),
  );
  if (loggedThatDay || state.misses[key]) return null;
  return { misses: { ...state.misses, [key]: miss } };
}

export interface Row {
  game: GameDef;
  status: "logged" | "missed" | "none";
  /** When the record was logged, as ISO. */
  at?: string;
  reason?: string;
}

/**
 * Today's 10 games in display order. A record counts for today when its game day is today or it was logged
 * today, since some games keep their own day (Travle's is UTC). Resets on the next local day.
 */
export function todayRows(state: State, now: Date): Row[] {
  const today = localDay(now);
  const isToday = (iso: string | undefined) => !!iso && localDay(new Date(iso)) === today;
  return GAMES.map((game) => {
    const logged = Object.entries(state.records)
      .filter(([key, r]) => r.game === game.id && (r.date === today || isToday(state.loggedAt[key])))
      .map(([key]) => state.loggedAt[key] ?? "")
      .sort()
      .at(-1);
    if (logged !== undefined) return { game, status: "logged", ...(logged && { at: logged }) };
    const miss = Object.values(state.misses).find((m) => m.game === game.id && (m.date === today || isToday(m.at)));
    if (miss) return { game, status: "missed", reason: miss.reason };
    return { game, status: "none" };
  });
}

/** The toolbar badge: a one-space dot, neutral after a capture, red-11 while a game is played but not logged. */
export function badgeFor(state: State, now: Date): { text: string; color: string } {
  const rows = todayRows(state, now);
  if (rows.some((r) => r.status === "missed")) return { text: " ", color: "#ce2c31" };
  if (rows.some((r) => r.status === "logged")) return { text: " ", color: "#8d8d86" };
  return { text: "", color: "#8d8d86" };
}

export async function loadState(): Promise<State> {
  const s = (await chrome.storage.local.get([...STATE_KEYS])) as Partial<State>;
  return { records: s.records ?? {}, misses: s.misses ?? {}, loggedAt: s.loggedAt ?? {}, ...(s.lastLogAt && { lastLogAt: s.lastLogAt }) };
}

export async function showBadge(state: State, now = new Date()) {
  const { text, color } = badgeFor(state, now);
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}
