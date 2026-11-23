import { enclosure } from "../../../src/parsers/enclose-horse";
import type { RecordOf } from "../../../src/record";
import { Bars, Caption, Card, Figure, fmt, type CardProps } from "./frame";
import { APPLE, BEES, CHERRY, HORSE, pixels, PORTAL, type Sprite } from "./sprites";

const MEDALS = {
  perfect: { label: "PERFECT!", bg: "#d4f4ff" },
  gold: { label: "Excellent!", bg: "#fff0b3" },
  silver: { label: "Great", bg: "#e0e0e0" },
  bronze: { label: "okay", bg: "#e8d4c4" },
} as const;

const kind = (glyph: string, wall: boolean, inside: boolean) =>
  wall ? "wall" : glyph === "~" ? "water" : glyph === "W" ? "fixed" : glyph === "H" ? "horse" : glyph !== "." ? "item" : inside ? "enclosed" : "grass";

/** Board pixels per cell; sprites are drawn on this 16 by 16 grid. */
const U = 16;
const GRASS = "#186b3b";
const TUFT = "#24804a";
const WATER = "#062f48";
const RIM = "#2a6f98";
const WAVE = "#1b557a";
const POST = "#6b4423";
const RAIL = "#c08a4a";
const RAIL_TOP = "#e2b36e";
const STONE = "#777474";
const ITEMS: Record<string, Sprite> = { C: CHERRY, G: APPLE, S: BEES };
const OFFSET = new Map<Sprite, [number, number]>([
  [CHERRY, [3, 3]],
  [APPLE, [3, 3]],
  [BEES, [3, 4]],
  [PORTAL, [4, 4]],
]);

const Pixels = ({ sprite, x, y }: { sprite: Sprite; x: number; y: number }) => (
  <>
    {pixels(sprite, x, y).map((p) => (
      <path key={p.fill} fill={p.fill} d={p.d} />
    ))}
  </>
);

/** A fence piece on its cell, its rails running toward the neighbours it meets (walls, water, stone). */
function Fence({ x, y, left, right, up, down }: { x: number; y: number; left: boolean; right: boolean; up: boolean; down: boolean }) {
  const across = left || right || !(up || down);
  const a = x + (left ? 0 : 2);
  const b = x + (right ? U : U - 2);
  const t = y + (up ? 0 : 2);
  const btm = y + (down ? U : U - 2);
  return (
    <>
      {across && (
        <>
          <rect x={a} y={y + 5} width={b - a} height={2} fill={RAIL} />
          <rect x={a} y={y + 10} width={b - a} height={2} fill={RAIL} />
          <rect x={a} y={y + 5} width={b - a} height={1} fill={RAIL_TOP} />
          <rect x={a} y={y + 10} width={b - a} height={1} fill={RAIL_TOP} />
          <rect x={x + 2} y={y + 3} width={3} height={11} fill={POST} />
          <rect x={x + U - 5} y={y + 3} width={3} height={11} fill={POST} />
        </>
      )}
      {(up || down) && (
        <>
          <rect x={x + 7} y={t} width={2} height={btm - t} fill={RAIL} />
          <rect x={x + 7} y={t} width={1} height={btm - t} fill={RAIL_TOP} />
          <rect x={x + 6} y={y + 2} width={4} height={4} fill={POST} />
          <rect x={x + 6} y={y + 10} width={4} height={4} fill={POST} />
        </>
      )}
    </>
  );
}

export function EncloseHorse({ record }: CardProps) {
  const { detail } = record as RecordOf<"enclose-horse">;
  // The parser's own flood fill, so portals and escapes match the game's scoring.
  const pen = enclosure(detail.map.split("\n"), detail.walls);
  const inside = new Set(pen.escaped ? [] : pen.cells);
  const medal = MEDALS[detail.medal];
  const hist = detail.histogram?.length ? detail.histogram : null;
  const own = hist ? Math.max(0, hist.findIndex((h) => detail.score >= h.minScore && detail.score <= h.maxScore)) : 0;
  return (
    <Card game="enclose-horse">
      <Figure
        game="enclose-horse"
        value={`${detail.score} of ${detail.optimal}`}
        label={
          <span className="medal" data-medal style={{ background: medal.bg }}>
            {medal.label}
          </span>
        }
      />
      <Board detail={detail} inside={inside} />
      {detail.rank !== null && detail.percentile !== null && <Caption>{`Rank #${fmt(detail.rank)}, top ${Math.max(1, Math.round(100 - detail.percentile))}%`}</Caption>}
      {hist && (
        <Bars
          label="Score distribution of today's players"
          bars={hist.map((h) => ({ label: h.minScore < 0 ? "No score" : h.minScore === h.maxScore ? `Score ${h.minScore}` : `Score ${h.minScore} to ${h.maxScore}`, value: h.count }))}
          own={own}
          rest="#ccc"
          ownColor="#3498db"
          readout={(b) => `${b.label}: ${fmt(b.value)} players`}
        />
      )}
    </Card>
  );
}

/**
 * The board as layered SVG, bottom to top: grass with a faint grid, water channels with a lighter rim,
 * the enclosed area's tint, item sprites, the player's fence pieces, the horse. An original redraw from
 * the record's map: no art from the game is bundled or loaded.
 */
function Board({ detail, inside }: { detail: RecordOf<"enclose-horse">["detail"]; inside: Set<number> }) {
  const { cols, rows } = detail;
  const tiles = detail.map.split("\n").join("");
  const walls = new Set(detail.walls);
  const cells = [...tiles].map((g, i) => ({ g, i, x: (i % cols) * U, y: Math.floor(i / cols) * U, c: i % cols, r: Math.floor(i / cols) }));
  const glyph = (r: number, c: number) => (r < 0 || c < 0 || r >= rows || c >= cols ? null : tiles[r * cols + c]!);
  const blocks = (r: number, c: number) => {
    const g = glyph(r, c);
    return g === "~" || g === "W" || walls.has(r * cols + c);
  };
  const water = cells.filter((k) => k.g === "~");
  // Rim: a lighter line inside each water edge that meets land; none along the board's own edge.
  const rim = water
    .flatMap(({ x, y, r, c }) => [
      glyph(r - 1, c) !== null && glyph(r - 1, c) !== "~" ? `M${x} ${y + 0.75}h${U}` : "",
      glyph(r + 1, c) !== null && glyph(r + 1, c) !== "~" ? `M${x} ${y + U - 0.75}h${U}` : "",
      glyph(r, c - 1) !== null && glyph(r, c - 1) !== "~" ? `M${x + 0.75} ${y}v${U}` : "",
      glyph(r, c + 1) !== null && glyph(r, c + 1) !== "~" ? `M${x + U - 0.75} ${y}v${U}` : "",
    ])
    .join("");
  const waves = water.map(({ x, y, r, c }) => ((r + c) % 2 ? `M${x + 9} ${y + 5}h3v1h-3z` : `M${x + 4} ${y + 10}h4v1h-4z`)).join("");
  const tufts = cells
    .filter((k) => k.g !== "~" && (k.r * 7 + k.c * 13) % 3 === 0)
    .map(({ x, y, r, c }) => {
      const tx = x + 3 + ((r * 5 + c * 3) % 9);
      const ty = y + 4 + ((r * 3 + c * 7) % 8);
      return `M${tx} ${ty}h1v2h-1zM${tx + 2} ${ty - 1}h1v3h-1z`;
    })
    .join("");
  const grid = [...Array.from({ length: cols - 1 }, (_, i) => `M${(i + 1) * U} 0v${rows * U}`), ...Array.from({ length: rows - 1 }, (_, i) => `M0 ${(i + 1) * U}h${cols * U}`)].join("");
  const horse = cells.find((k) => k.g === "H");
  return (
    <svg
      className="board"
      data-board
      data-tiles
      role="img"
      aria-label={`Board with ${detail.walls.length} walls placed`}
      viewBox={`0 0 ${cols * U} ${rows * U}`}
      width={cols * 24}
      shapeRendering="crispEdges"
    >
      <g data-layer="ground">
        {cells.map(({ g, i, x, y }) => (
          <rect key={i} data-cell={kind(g, walls.has(i), inside.has(i))} data-at={i} x={x} y={y} width={U} height={U} fill={GRASS} />
        ))}
        <path d={tufts} fill={TUFT} />
        <path data-grid d={grid} stroke="#000" strokeOpacity={0.12} strokeWidth={1} fill="none" />
      </g>
      <g data-layer="water">
        {water.map(({ i, x, y }) => (
          <rect key={i} data-water data-at={i} x={x} y={y} width={U} height={U} fill={WATER} />
        ))}
        <path d={waves} fill={WAVE} />
        <path data-rim d={rim} stroke={RIM} strokeWidth={1.5} fill="none" />
      </g>
      <g data-layer="tint">
        {[...inside].map((i) => (
          <rect key={i} data-tint data-at={i} x={(i % cols) * U} y={Math.floor(i / cols) * U} width={U} height={U} fill="#fff0b3" fillOpacity={0.2} />
        ))}
      </g>
      <g data-layer="items">
        {cells.flatMap(({ g, i, x, y }) => {
          const sprite = ITEMS[g] ?? (/[0-9a-z]/.test(g) ? PORTAL : null);
          if (!sprite) return [];
          const [dx, dy] = OFFSET.get(sprite)!;
          return [
            <g key={i} data-item={sprite === PORTAL ? "portal" : g} data-at={i}>
              <Pixels sprite={sprite} x={x + dx} y={y + dy} />
            </g>,
          ];
        })}
      </g>
      <g data-layer="walls">
        {cells
          .filter((k) => k.g === "W")
          .map(({ i, x, y }) => (
            <g key={i} data-fixed data-at={i}>
              <rect x={x} y={y} width={U} height={U} fill={STONE} />
              <rect x={x} y={y} width={U} height={2} fill="#9a9797" />
            </g>
          ))}
        {detail.walls.map((i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          return (
            <g key={i} data-wall data-at={i}>
              <Fence x={c * U} y={r * U} left={blocks(r, c - 1)} right={blocks(r, c + 1)} up={blocks(r - 1, c)} down={blocks(r + 1, c)} />
            </g>
          );
        })}
      </g>
      <g data-layer="horse">
        {horse && (
          <g data-horse data-at={horse.i}>
            <Pixels sprite={HORSE} x={horse.x + 1} y={horse.y + 2} />
          </g>
        )}
      </g>
    </svg>
  );
}
