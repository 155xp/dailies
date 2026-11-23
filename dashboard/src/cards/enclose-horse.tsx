import { enclosure } from "../../../src/parsers/enclose-horse";
import type { RecordOf } from "../../../src/record";
import { Bars, Caption, Card, Figure, fmt, type CardProps } from "./frame";

const MEDALS = {
  perfect: { label: "PERFECT!", bg: "#d4f4ff" },
  gold: { label: "Excellent!", bg: "#fff0b3" },
  silver: { label: "Great", bg: "#e0e0e0" },
  bronze: { label: "okay", bg: "#e8d4c4" },
} as const;

const kind = (glyph: string, wall: boolean, inside: boolean) =>
  wall ? "wall" : glyph === "~" ? "water" : glyph === "W" ? "fixed" : glyph === "H" ? "horse" : glyph !== "." ? "item" : inside ? "enclosed" : "grass";

export function EncloseHorse({ record }: CardProps) {
  const { detail } = record as RecordOf<"enclose-horse">;
  const grid = detail.map.split("\n").join("").split("");
  const walls = new Set(detail.walls);
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
      <div
        className="board"
        data-board
        data-tiles
        role="img"
        aria-label={`Board with ${detail.walls.length} walls placed`}
        style={{ gridTemplateColumns: `repeat(${detail.cols}, minmax(0, 1fr))`, maxWidth: detail.cols * 24, aspectRatio: `${detail.cols} / ${detail.rows}` }}
      >
        {grid.map((g, i) => (
          <i key={i} data-cell={kind(g, walls.has(i), inside.has(i))} data-glyph={g} className={inside.has(i) ? "in" : undefined} />
        ))}
      </div>
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
