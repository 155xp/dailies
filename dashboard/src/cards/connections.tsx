import type { RecordOf } from "../../../src/record";
import { Card, Figure, type CardProps } from "./frame";

/** Group colors, 0 yellow to 3 purple, from the game's CSS. All four take black text. */
export const LEVELS = ["#f9df6d", "#a0c35a", "#b0c4ef", "#ba81c5"];

export function Connections({ record }: CardProps) {
  const { detail } = record as RecordOf<"connections">;
  return (
    <Card game="connections">
      <Figure game="connections" value={String(detail.mistakes)} label={<span className="meta">{detail.mistakes === 1 ? "Mistake" : "Mistakes"}</span>} />
      <div className="conn" data-tiles role="img" aria-label={`${detail.guesses.length} guesses`}>
        {detail.guesses.map((g, r) => (
          <div className="conn-row" data-guess key={r}>
            {g.levels.map((level, i) => (
              <i key={i} className="tile" data-tile data-level={level} style={{ background: LEVELS[level] }} />
            ))}
          </div>
        ))}
      </div>
      <ul className="groups">
        {detail.solved.map((level) => (
          <li key={level} className="tile group" data-group data-level={level} style={{ background: LEVELS[level] }}>
            {detail.guesses.find((g) => g.correct && g.levels[0] === level)?.words.join(", ")}
          </li>
        ))}
      </ul>
    </Card>
  );
}
