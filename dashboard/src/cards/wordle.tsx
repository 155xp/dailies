import type { RecordOf } from "../../../src/record";
import { Bars, Card, Figure, plural, type CardProps } from "./frame";

const LABELS = ["1", "2", "3", "4", "5", "6", "X"];
/** The distribution bar for a finished game; an unfinished one has none. */
const slot = (r: RecordOf<"wordle">) => (r.status === "won" ? r.detail.guesses.length - 1 : r.status === "lost" ? 6 : -1);

export function Wordle({ record, history }: CardProps) {
  const r = record as RecordOf<"wordle">;
  const counts = LABELS.map((_, i) => history.filter((h) => slot(h as RecordOf<"wordle">) === i).length);
  const rows = Array.from({ length: Math.max(6, r.detail.guesses.length) }, (_, i) => r.detail.guesses[i] ?? "");
  return (
    <Card game="wordle">
      <Figure
        game="wordle"
        value={r.status === "partial" ? "In progress" : `${r.status === "won" ? r.detail.guesses.length : "X"}/6`}
        label={r.status === "partial" || r.detail.hardMode ? <span className="meta">{[r.status === "partial" && `${r.detail.guesses.length} of 6 guesses`, r.detail.hardMode && "Hard mode"].filter(Boolean).join(", ")}</span> : undefined}
      />
      {/* One row per guess, five lettered tiles each, padded with empty rows to Wordle's six. */}
      <div className="wordle" data-tiles role="img" aria-label={`Guesses: ${r.detail.guesses.join(", ")}`}>
        {rows.map((word, row) => (
          <div key={row} className="wordle-row" data-guess-row data-state={word ? "filled" : "empty"}>
            {Array.from({ length: 5 }, (_, i) => (
              <i key={i} className="gtile" data-tile data-mark={r.detail.evaluations[row]?.[i] ?? "empty"}>
                {word[i]?.toUpperCase()}
              </i>
            ))}
          </div>
        ))}
      </div>
      {counts.some((n) => n > 0) && (
        <Bars
          label="Your guess distribution"
          bars={counts.map((n, i) => ({ label: i === 6 ? "X" : plural(i + 1, "guess", "guesses"), value: n }))}
          own={slot(r)}
          ownColor="var(--wordle-correct)"
          // Under 3 games a full-height bar would read as a whole distribution: each game is a third of the plot.
          floor={counts.reduce((a, b) => a + b, 0) < 3 ? 3 : 0}
          readout={(b) => `${b.label}: ${plural(b.value, "game")}`}
        />
      )}
    </Card>
  );
}
