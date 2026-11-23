export type GameId =
  | "krillion"
  | "travle"
  | "enclose-horse"
  | "wordle"
  | "connections"
  | "spelling-bee"
  | "mini"
  | "globle"
  | "songless";

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

/** One graded piece of a guess: a letter, a card. */
export interface Mark {
  value: string;
  /** The game's own verdict, for example "correct", "present", "yellow". */
  mark: string;
  /** The color the game paints this mark with, from the game's own CSS. */
  color?: string;
}

/** One guess, answer or attempt, in the order the player made it. */
export interface Guess extends Mark {
  /** The prompt this guess answered, for games with a prompt per round. */
  prompt?: string;
  /** Per-letter or per-card grading, for games that grade parts of a guess. */
  parts?: Mark[];
  points?: number;
}

export interface Bucket {
  label: string;
  /** Player count, or a relative weight when the game only exposes weights. */
  count: number;
}

/** A redrawable board: the game's map rows plus the cells the player chose. */
export interface Layout {
  cols: number;
  rows: number;
  /** Map rows, one string per row, in the game's own tile alphabet. */
  map: string[];
  /** Cells the player placed, as `row * cols + col`. */
  placed: number[];
  /** Cells inside the player's enclosure, as `row * cols + col`. */
  enclosed?: number[];
}

export type Outcome = "win" | "loss" | "partial";

export interface GameResult {
  game: GameId;
  /** The id the game itself keys this puzzle by. */
  puzzleId: string;
  /** The public number the game shows players, when it differs from `puzzleId`. */
  puzzleNumber?: number;
  /** Puzzle date, `YYYY-MM-DD`. */
  date: string;
  outcome: Outcome;
  /** The game's headline number; `scoreUnit` says what it counts. */
  score: number;
  scoreUnit: "guesses" | "points" | "mistakes" | "attempts";
  maxScore?: number;
  /** The fewest guesses the puzzle can be solved in, when the game says. */
  par?: number;
  guesses: Guess[];
  hintsUsed?: number;
  timeSeconds?: number;
  /** Share of other players this result beat, 0 to 100, as the game reports it. */
  percentile?: number;
  /** The game's "top X%" figure: share of players who did as well or better, 0 to 100. */
  topPercent?: number;
  rank?: number;
  /** A named rank or medal, for example "Solid" or "diamond". */
  rankLabel?: string;
  distribution?: Bucket[];
  layout?: Layout;
  shareText?: string;
}

/** A parser turns one capture into a result, or null when the capture holds no result for the game. */
export type Parser = (capture: Capture) => GameResult | null;
