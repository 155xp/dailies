/** A network response the game's own page received, as seen by the extension. */
export interface CapturedResponse {
  url: string;
  method: string;
  status?: number;
  body: unknown;
  /** The request body the page sent, when it matters (for example a submit call). */
  requestBody?: unknown;
}

/** Everything the extension read from one game page. Each parser reads only what it needs. */
export interface Capture {
  /** The game's share text, as the game wrote it to the clipboard or share sheet. */
  share?: string;
  localStorage?: Record<string, unknown>;
  /** IndexedDB records keyed by `<database>/<store>`. */
  indexedDB?: Record<string, unknown[]>;
  responses?: CapturedResponse[];
  /** Page globals the game exposes, such as `gameData`. */
  page?: Record<string, unknown>;
}
