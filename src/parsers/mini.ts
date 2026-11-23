import type { Parser } from "../types";

/**
 * Signed out, the Mini is gated before the board loads and the game saves nothing
 * (fixtures/mini/*). A signed-in save lives under `games-state-crossword_mini/<account id>`,
 * but no fixture of it exists yet, so this parser reports no result until one is captured.
 */
export const parseMini: Parser = () => null;
