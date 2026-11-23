import { PARSERS } from "../../src/parsers";
import type { DailyRecord, RecordParser } from "../../src/record";
import type { CapturedResponse } from "../../src/types";
import type { GameDef } from "./games";

export interface PageView {
  /** The page's localStorage, as strings. Only the game's own keys are read. */
  storage: Record<string, string>;
  share?: string;
  responses: CapturedResponse[];
  page: Record<string, unknown>;
  indexedDB: Record<string, unknown[]>;
}

/** Turn what the hooks saw into a finished record with the shared parsers, or null if there is none yet. */
export function captureFrom(game: GameDef, view: PageView): DailyRecord | null {
  const localStorage = Object.fromEntries(Object.entries(view.storage).filter(([k]) => game.keys?.test(k)));
  const parse = PARSERS[game.id] as RecordParser;
  let record: DailyRecord | null;
  try {
    record = parse({ ...(view.share !== undefined && { share: view.share }), localStorage, responses: view.responses, page: view.page, indexedDB: view.indexedDB });
  } catch {
    return null;
  }
  return record && (game.done?.(record) ?? true) ? record : null;
}
