import type { Capture, CapturedResponse } from "../types";

export type Json = Record<string, unknown>;

/** localStorage values arrive as strings on a live page and already parsed in tests. */
export function storageValue(capture: Capture, key: string): unknown {
  const raw = capture.localStorage?.[key];
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** The first localStorage key matching `pattern`, parsed. */
export function storageMatch(capture: Capture, pattern: RegExp): unknown {
  const key = Object.keys(capture.localStorage ?? {}).find((k) => pattern.test(k));
  return key === undefined ? undefined : storageValue(capture, key);
}

/** The last response whose URL matches `pattern`, so later polls win over earlier ones. */
export function findResponse(capture: Capture, pattern: RegExp, method?: string): CapturedResponse | undefined {
  return capture.responses?.filter((r) => pattern.test(r.url) && (!method || r.method === method)).at(-1);
}

/** The latest saved state of an NYT game, signed in (`/<account id>`) or out (`/ANON`). */
export function nytState(capture: Capture, game: string): { puzzleId: string; printDate: string; data: Json } | null {
  const pattern = new RegExp(`^games-state-${game}/[^/]+$`);
  const value = storageMatch(capture, pattern) as { states?: { puzzleId: string; printDate: string; data: Json }[] } | undefined;
  return value?.states?.[0] ?? null;
}
