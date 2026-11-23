import type { RecordOf } from "../../../src/record";
import { Card, Figure, fmt, plural, type CardProps } from "./frame";
import { hive } from "./hive";

/** The game's ten ranks, lowest first. */
const RANKS = ["Beginner", "Good Start", "Moving Up", "Good", "Solid", "Nice", "Great", "Amazing", "Genius", "Queen Bee"];
/** Cell offsets in steps from the middle: the middle cell, then the six round it, clockwise from the top. */
const CELLS = [[0, 0], [0, -1], [1, -0.5], [1, 0.5], [0, 1], [-1, 0.5], [-1, -0.5]] as const;
/** A flat-topped hexagon is 56 by 48; neighbours sit 46px across and 52px down, leaving a 4px gap. */
const at = ([x, y]: readonly [number, number]) => ({ left: 46 + x * 46, top: 52 + y * 52 });
const capital = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export function SpellingBee({ record }: CardProps) {
  const { score, detail } = record as RecordOf<"spelling-bee">;
  const rank = RANKS.indexOf(detail.rank);
  const h = hive(detail.words, detail.pangrams);
  const up = h?.letters.map((c) => c.toUpperCase()) ?? [];
  const pangrams = new Set(detail.pangrams.map((w) => w.toLowerCase()));
  const words = [...detail.words].sort((a, b) => a.localeCompare(b));
  return (
    <Card game="spelling-bee">
      <Figure game="spelling-bee" value={fmt(score)} label={<span className="meta">{detail.maxPoints === null ? "points" : `of ${fmt(detail.maxPoints)} points`}</span>} />
      <div className="ladder-row">
        <div className="ladder" data-ladder data-tiles role="img" aria-label={`Rank ${rank + 1} of ${RANKS.length}`}>
          {RANKS.map((name, i) => (
            <i key={name} className="gtile" data-step data-on={i <= rank ? "" : undefined} />
          ))}
        </div>
        <p data-rank>{detail.rank}</p>
      </div>
      {h && (
        <div className="hive" data-hive data-tiles role="img" aria-label={h.center ? `Letters ${up.slice(1).join(", ")} round the center letter ${up[0]}` : `Letters ${up.join(", ")}`}>
          {up.map((c, i) => (
            <i key={c} data-cell data-center={h.center && i === 0 ? "" : undefined} style={at(CELLS[i]!)}>
              {c}
            </i>
          ))}
        </div>
      )}
      <p className="meta">
        {plural(detail.words.length, "word")} · {plural(detail.pangrams.length, "pangram")}
      </p>
      {words.length > 0 && (
        <ul className="bee-words" data-words>
          {words.map((w) => (
            <li key={w} data-word data-pangram={pangrams.has(w.toLowerCase()) ? "" : undefined}>
              {capital(w)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
