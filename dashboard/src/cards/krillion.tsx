import type { RecordOf } from "../../../src/record";
import { Bars, Caption, Card, Figure, fmt, type CardProps } from "./frame";

const TIERS: Record<string, string> = {
  plankton: "Plankton",
  tooclever: "Too Clever",
  schooler: "Schooler",
  rare: "Rare",
  deepcut: "Deep Cut",
  krillion: "One in a Krillion",
};
/** The day's band by score, from the game's own results screen. */
const band = (s: number) => (s <= 150 ? "Plankton" : s <= 250 ? "Schooler" : s <= 350 ? "Rare" : s <= 449 ? "Deep cut" : "One in a krillion");
/** The live chart spans 0 to 700 points (7 prompts of 100) in 20 equal buckets. */
const MAX = 700;
const share = (p: number) => `${p < 1 ? p.toFixed(1) : Math.round(p)}%`;

export function Krillion({ record }: CardProps) {
  const { score, detail } = record as RecordOf<"krillion">;
  const dist = detail.dist?.length ? detail.dist : null;
  const width = dist ? MAX / dist.length : 0;
  const at = dist ? Math.min(dist.length - 1, Math.floor(score / width)) : 0;
  return (
    <Card game="krillion">
      <Figure game="krillion" value={fmt(score)} label={<span className="meta">{band(score)}</span>} />
      <ul className="krill">
        {detail.answers.map((a, i) => (
          <li data-row key={i}>
            <p className="meta prompt">{a.prompt}</p>
            <p className="krill-line">
              <span className="answer">{a.answer ?? "No answer"}</span>
              <span className="krill-meta meta">
                <span className="tier-mark">
                  <i className="gtile swatch" data-swatch style={{ background: a.color }} />
                  <span className="tier">{a.tier ? TIERS[a.tier] : "Missed"}</span>
                </span>
                <span className="points">{a.points} pts</span>
                {a.sharePct !== null && (
                  <span>
                    <span className="share">{share(a.sharePct)}</span> gave this
                  </span>
                )}
              </span>
            </p>
          </li>
        ))}
      </ul>
      {detail.betterThan !== undefined && <Caption>{`Better than ${Math.round(detail.betterThan)}% of today's players`}</Caption>}
      {dist && (
        <Bars
          label="Score distribution of today's players"
          bars={dist.map((n, i) => ({
            label: `${fmt(i * width)} to ${fmt((i + 1) * width - 1)} points`,
            value: n,
            // A light [1 2 1] smoothing, as the game draws a smoothed curve.
            height: ((dist[i - 1] ?? n) + 2 * n + (dist[i + 1] ?? n)) / 4,
            color: i < at ? "#4de3ff" : undefined,
          }))}
          own={at}
          ownColor="#4de3ff"
          rule={score / MAX}
          readout={(b) => `${b.label}: ${fmt(b.value)} players`}
        />
      )}
    </Card>
  );
}
