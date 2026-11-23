import type { RecordOf } from "../../../src/record";
import { SONGLESS_COLORS } from "../../../src/parsers/songless";
import { Bars, Caption, Card, Figure, type CardProps } from "./frame";

/** Clip length per attempt, from the game's timeline label. */
const CLIPS = [0.1, 0.5, 2, 8, 15];
/** Only category 0 is confirmed by a fixture ("I found the Top Hits song"). */
const CATEGORIES: Record<number, string> = { 0: "Top Hits" };
const LABELS = ["1", "2", "3", "4", "5", "Missed"];

export function Songless({ record }: CardProps) {
  const { status, detail } = record as RecordOf<"songless">;
  const found = detail.board.findIndex((b) => b.state === "correct");
  const steps = CLIPS.map((_, i) => detail.board[i]?.state ?? "unused");
  const total = detail.distribution?.reduce((n, w) => n + w, 0) ?? 0;
  return (
    <Card game="songless">
      <Figure
        game="songless"
        value={status === "won" && found >= 0 ? `${CLIPS[found]}s` : "Not found"}
        label={status === "won" && found >= 0 ? <span className="meta">Attempt {found + 1}</span> : undefined}
      />
      <div className="song">
        <p data-category>{CATEGORIES[detail.categoryId] ?? `Category ${detail.categoryId}`}</p>
        <div className="song-steps" data-tiles role="img" aria-label={steps.join(", ")}>
          {steps.map((s, i) => (
            <span key={i} className="song-step">
              <i className="gtile" data-tile data-state={s} style={{ background: SONGLESS_COLORS[s] }} />
              <span className="meta">{CLIPS[i]}s</span>
            </span>
          ))}
        </div>
      </div>
      {detail.answer && (
        <p className="meta">
          {detail.answer.track}, {detail.answer.artist}
        </p>
      )}
      {detail.topPercent !== null && <Caption>{`Top ${detail.topPercent}% today`}</Caption>}
      {detail.distribution && total > 0 && (
        <Bars
          label="Today's attempts"
          bars={detail.distribution.map((w, i) => ({ label: LABELS[i] ?? String(i + 1), value: w }))}
          own={status === "won" ? found : 5}
          ownColor={SONGLESS_COLORS.correct!}
          readout={(b) => `${b.label === "Missed" ? "Missed" : `Attempt ${b.label}`}: ${((b.value / total) * 100).toFixed(1)}% of players`}
        />
      )}
    </Card>
  );
}
