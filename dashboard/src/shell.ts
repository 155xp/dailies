import { useEffect } from "react";
import type { DailyRecord } from "../../src/record";
import type { Miss, Status } from "./bridge";
import { GAMES } from "./games";

/**
 * The static shell in index.html (dailies#16) paints before any JS. The extension can't be asked that early,
 * so the page remembers how the last visit resolved and the shell reserves room for that: the install card,
 * the one-line hint, and which rows take two lines at 390. With nothing remembered it lays out a first visit.
 */
export const SHELL_KEY = "dailies-shell";

export type ShellState = "connected" | "empty" | "missing";
export interface Snapshot {
  date: string;
  state: ShellState;
  /** Games with a result or a played-not-logged row today, in display order: their rows take two lines at 390. */
  played: string[];
}

export const WHAT = "Logs your daily word and map games from their own sites, in this browser only, with no sign-in and no upload.";
export const HINT = "Play any game below. Your result shows up here when you finish.";

/**
 * The layout to reserve from the last snapshot. Self-contained: index.html inlines it as written. An unreadable
 * snapshot counts as none, and a snapshot from another day means nothing is played yet.
 */
export function predict(raw: string | null, today: string): { state: ShellState; played: string[] } {
  let s: { date?: unknown; state?: unknown; played?: unknown } | null;
  try {
    s = JSON.parse(raw || "null");
  } catch {
    s = null;
  }
  if (!s || typeof s !== "object" || (s.state !== "connected" && s.state !== "empty")) return { state: "missing", played: [] };
  if (s.date !== today) return { state: "empty", played: [] };
  const played = Array.isArray(s.played) ? s.played.filter((id): id is string => typeof id === "string") : [];
  return { state: s.state, played };
}

/** What to remember for the next visit; loading and error keep the last good one. */
export function snapshotOf(status: Status, records: DailyRecord[], misses: Miss[], today: string): Snapshot | null {
  if (status === "missing") return { date: today, state: "missing", played: [] };
  if (status !== "connected") return null;
  const logged = new Set(records.filter((r) => r.date === today).map((r) => r.game as string));
  const missed = new Set(misses.filter((m) => m.date === today).map((m) => m.game));
  const played = GAMES.map((g) => g.id as string).filter((id) => logged.has(id) || missed.has(id));
  return { date: today, state: logged.size ? "connected" : "empty", played };
}

/** What the inline script predicted for this page load; with no script run, the shell's default. */
export const shellState = (): ShellState => (document.documentElement.dataset.shell as ShellState | undefined) ?? "missing";

export function useSnapshot(status: Status, records: DailyRecord[], misses: Miss[], today: string) {
  useEffect(() => {
    const s = snapshotOf(status, records, misses, today);
    if (!s) return;
    try {
      localStorage.setItem(SHELL_KEY, JSON.stringify(s));
    } catch {
      // Storage refused (a private window): the next visit lays out a first visit.
    }
  }, [status, records, misses, today]);
}
