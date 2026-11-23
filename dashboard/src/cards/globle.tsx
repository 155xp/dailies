import type { RecordOf } from "../../../src/record";
import { Card, Figure, type CardProps } from "./frame";

/**
 * Distance buckets as the game shares them (share of 15,000 km), each in the game's own map color sampled
 * inside that bucket (`fixtures/globle/*\/colors.json`); the answer is drawn `green`.
 */
const HEAT: Record<string, string> = {
  correct: "#008000",
  hot: "rgb(223, 67, 46)",
  warm: "rgb(241, 110, 74)",
  mild: "rgb(253, 190, 135)",
  cold: "rgb(254, 228, 192)",
};

export function Globle({ record, history }: CardProps) {
  const { score, status, detail } = record as RecordOf<"globle">;
  const wins = history.filter((h) => h.status === "won");
  const average = wins.length ? wins.reduce((n, h) => n + h.score, 0) / wins.length : null;
  return (
    <Card game="globle">
      <Figure game="globle" value={String(score)} label={<span className="meta">{score === 1 ? "Guess" : "Guesses"}</span>} />
      <div className="globle" data-tiles role="img" aria-label={`Guesses by distance: ${detail.countries.join(", ")}`}>
        {detail.countries.map((c, i) => {
          const heat = detail.heat?.[i] ?? "unknown";
          return <i key={i} className="gtile" data-tile data-heat={heat} style={{ background: HEAT[heat] }} />;
        })}
      </div>
      <p>{status === "won" ? `Found ${detail.countries.at(-1)}` : `Last guess ${detail.countries.at(-1) ?? "none"}`}</p>
      <p className="meta">
        Streak {detail.currentStreak} · Best {detail.maxStreak}
        {average !== null && ` · Average ${average.toFixed(1)}`}
      </p>
    </Card>
  );
}
