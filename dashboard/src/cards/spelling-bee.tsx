import type { RecordOf } from "../../../src/record";
import { Card, Figure, fmt, plural, type CardProps } from "./frame";

/** The game's ten ranks, lowest first. */
const RANKS = ["Beginner", "Good Start", "Moving Up", "Good", "Solid", "Nice", "Great", "Amazing", "Genius", "Queen Bee"];

export function SpellingBee({ record }: CardProps) {
  const { score, detail } = record as RecordOf<"spelling-bee">;
  const at = RANKS.indexOf(detail.rank);
  return (
    <Card game="spelling-bee">
      <Figure game="spelling-bee" value={fmt(score)} label={<span className="meta">{detail.maxPoints === null ? "points" : `of ${fmt(detail.maxPoints)} points`}</span>} />
      <div className="ladder-row">
        <div className="ladder" data-ladder data-tiles role="img" aria-label={`Rank ${at + 1} of ${RANKS.length}`}>
          {RANKS.map((name, i) => (
            <i key={name} className="gtile" data-step data-on={i <= at ? "" : undefined} />
          ))}
        </div>
        <p data-rank>{detail.rank}</p>
      </div>
      <p className="meta">
        {plural(detail.words.length, "word")} · {plural(detail.pangrams.length, "pangram")}
      </p>
    </Card>
  );
}
