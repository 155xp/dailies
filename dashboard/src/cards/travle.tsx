import type { RecordOf } from "../../../src/record";
import { Bars, Caption, Card, Figure, fmt, inkOn, plural, type CardProps } from "./frame";

/**
 * The four rating roles. Travle draws ratings as emoji only and has no rating hex (docs/CAPTURE.md #4),
 * so these are role colors in the emoji's hues: on route, near route, small detour, big detour.
 */
export const RATINGS = { perfect: "#3f9b4a", "near-perfect": "#a3d977", good: "#f5a142", poor: "#e5534b" } as const;
const T_LABELS = ["Lost", "Perfect", "+0", "+1", "+2", "+3", "+4"];

export function Travle({ record }: CardProps) {
  const { score, status, detail } = record as RecordOf<"travle">;
  const extra = detail.par === null ? null : score - detail.par;
  const value = status === "lost" ? `${detail.away ?? "Some"} away` : detail.perfect ? "Perfect" : extra === null ? plural(score, "guess", "guesses") : `+${extra}`;
  // Buckets pair up as `t * 2 + (hints ? 1 : 0)`; show the player's hint group, best first, lost last.
  const t = status === "lost" ? 0 : detail.perfect && extra === 0 ? 1 : extra === null ? null : Math.min(6, 2 + extra);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const dist = detail.distribution;
  return (
    <Card game="travle">
      <Figure game="travle" value={value} label={<span className="meta">{[detail.par !== null && `Par ${detail.par}`, plural(score, "guess", "guesses"), detail.hints > 0 && plural(detail.hints, "hint")].filter(Boolean).join(", ")}</span>} />
      <div className="chips" data-tiles role="img" aria-label="Guesses by rating">
        {detail.guesses.map((g, i) => (
          <i key={i} className="tile chip" data-tile data-rating={g.rating} style={{ background: RATINGS[g.rating], color: inkOn(RATINGS[g.rating]) }}>
            {g.country}
          </i>
        ))}
      </div>
      {detail.optimalRoute.length > 0 && <p className="meta">Shortest route {detail.optimalRoute.join(", ")}</p>}
      {detail.topPercent !== null && <Caption>{`Top ${detail.topPercent}% today`}</Caption>}
      {dist && t !== null && (
        <Bars
          label="Today's results"
          bars={order.map((ti) => ({ label: T_LABELS[ti]!, value: dist[ti * 2 + (detail.hints ? 1 : 0)] ?? 0 }))}
          own={order.indexOf(t)}
          ownColor="#7daea3"
          readout={(b) => `${b.label}: ${fmt(b.value)} players`}
        />
      )}
    </Card>
  );
}
