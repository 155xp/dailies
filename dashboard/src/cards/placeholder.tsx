import type { DailyRecord } from "../../../src/record";
import { gameById } from "../games";

export type CardProps = { record: DailyRecord; history: DailyRecord[] };

/** Stand-in until the real per-game cards land: title link and the record's score. */
export function PlaceholderCard({ record }: CardProps) {
  const game = gameById(record.game);
  return (
    <article className="card" data-panel>
      <h3 className="card-title">
        <a className="link" href={game.url} target="_blank" rel="noopener">
          {game.name}
        </a>
      </h3>
      <p className="figure" data-value={`${game.name} score ${record.score}`}>
        {record.score}
      </p>
      <p className="meta">Score</p>
    </article>
  );
}
