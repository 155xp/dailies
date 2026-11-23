/**
 * Pixel sprites for the enclose.horse board, drawn for this dashboard. Nothing here is copied from
 * the game: each sprite is a grid of characters, one per pixel, '.' empty, the rest keyed to a color.
 * Units are board pixels; a cell is 16 by 16.
 */
export interface Sprite {
  rows: string[];
  colors: Record<string, string>;
  /** Drawn on every empty pixel that touches the sprite, so it reads on grass and on the tint. */
  outline?: string;
}

/** One path per color: a 1 by 1 square per pixel, offset to (x, y). */
export function pixels({ rows, colors, outline }: Sprite, x = 0, y = 0): { fill: string; d: string }[] {
  const at = (r: number, c: number) => rows[r]?.[c] ?? ".";
  const paths = new Map<string, string[]>();
  const put = (fill: string, r: number, c: number) => paths.set(fill, [...(paths.get(fill) ?? []), `M${x + c} ${y + r}h1v1h-1z`]);
  const width = Math.max(...rows.map((r) => r.length));
  for (let r = -1; r <= rows.length; r++) {
    for (let c = -1; c <= width; c++) {
      const ch = at(r, c);
      if (ch !== ".") put(colors[ch]!, r, c);
      else if (outline && [at(r - 1, c), at(r + 1, c), at(r, c - 1), at(r, c + 1)].some((n) => n !== ".")) put(outline, r, c);
    }
  }
  return [...paths].map(([fill, d]) => ({ fill, d: d.join("") }));
}

const EDGE = "#0b2516";

/** A white horse in profile, facing left. 14 by 13, drawn at (1, 2) in its cell. */
export const HORSE: Sprite = {
  outline: EDGE,
  colors: { w: "#ffffff", s: "#d8dde0", m: "#b9bec2", e: "#1a1a1a", n: "#e9c9c4", h: "#5d5f61" },
  rows: [
    "..m...........",
    ".wmm..........",
    "wwwmm.........",
    "wewwmm........",
    "wwwwwm........",
    "nww.wwmwwwwww.",
    "....wwwwwwwwwm",
    "....wwwwwwwwwm",
    "....swwwwwwws.",
    "....w.w...w.w.",
    "....w.w...w.w.",
    "....w.w...w.w.",
    "....h.h...h.h.",
  ],
};

/** Two cherries on one stem. 10 by 9, drawn at (3, 3). */
export const CHERRY: Sprite = {
  outline: EDGE,
  colors: { g: "#2f6b1f", l: "#5cb85c", r: "#ba1d27", R: "#ff8a8a", d: "#870029" },
  rows: [
    "......gl..",
    ".....g.ll.",
    "....g.g...",
    "...g...g..",
    "..g....g..",
    ".rr...rr..",
    "rRrr.rRrr.",
    "rrrd.rrrd.",
    ".dd...dd..",
  ],
};

/** A golden apple with a leaf. 10 by 9, drawn at (3, 3). */
export const APPLE: Sprite = {
  outline: EDGE,
  colors: { y: "#f7e133", Y: "#fff8b0", o: "#c9a30f", b: "#6b4423", l: "#5cb85c" },
  rows: [
    ".....b.ll.",
    ".....bll..",
    "..yyyyyy..",
    ".yYYyyyyo.",
    "yYYyyyyyyo",
    "yYyyyyyyyo",
    "yyyyyyyyyo",
    ".yyyyyyoo.",
    "..yyoooo..",
  ],
};

/** A small swarm: wings over a striped body. 10 by 7, drawn at (3, 4). */
export const BEES: Sprite = {
  outline: EDGE,
  colors: { c: "#c8f1f2", y: "#f7c81e", k: "#1a1a1a" },
  rows: [
    "..cc..cc..",
    ".cccc.ccc.",
    "..ccc.cc..",
    "..ykykyk..",
    ".ykykykyk.",
    ".ykykykyk.",
    "..ykykyk..",
  ],
};

/** A portal ring, for maps that have them. 8 by 8, drawn at (4, 4). */
export const PORTAL: Sprite = {
  outline: EDGE,
  colors: { p: "#b48cff", P: "#e3d4ff" },
  rows: ["..pppp..", ".pPPPPp.", "pP....Pp", "pP....Pp", "pP....Pp", "pP....Pp", ".pPPPPp.", "..pppp.."],
};
