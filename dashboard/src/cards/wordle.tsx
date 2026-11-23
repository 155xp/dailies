import type { RecordOf } from "../../../src/record";
import { Bars, Card, Figure, plural, type CardProps } from "./frame";

const LABELS = ["1", "2", "3", "4", "5", "6", "X"];
/** The distribution bar for a finished game; an unfinished one has none. */
const slot = (r: RecordOf<"wordle">) => (r.status === "won" ? r.detail.guesses.length - 1 : r.status === "lost" ? 6 : -1);

export function Wordle({ record, history }: CardProps) {
  const r = record as RecordOf<"wordle">;
  const counts = LABELS.map((_, i) => history.filter((h) => slot(h as RecordOf<"wordle">) === i).length);
  const rows = Array.from({ length: 6 }, (_, i) => r.detail.guesses[i] ?? "");
  return (
    <Card game="wordle">
      <Figure
        game="wordle"
        value={r.status === "partial" ? "In progress" : `${r.status === "won" ? r.detail.guesses.length : "X"}/6`}
        label={r.status === "partial" || r.detail.hardMode ? <span className="meta">{[r.status === "partial" && `${r.detail.guesses.length} of 6 guesses`, r.detail.hardMode && "Hard mode"].filter(Boolean).join(", ")}</span> : undefined}
      />
      <div className="wordle" data-tiles role="img" aria-label={`Guesses: ${r.detail.guesses.join(", ")}`}>
        {rows.flatMap((word, row) =>
          Array.from({ length: 5 }, (_, i) => (
            <i key={`${row}-${i}`} className="gtile" data-tile data-mark={r.detail.evaluations[row]?.[i] ?? "empty"}>
              {word[i]?.toUpperCase()}
            </i>
          )),
        )}
      </div>
      {counts.some((n) => n > 0) && (
        <Bars
          label="Your guess distribution"
          bars={counts.map((n, i) => ({ label: i === 6 ? "X" : plural(i + 1, "guess", "guesses"), value: n }))}
          own={slot(r)}
          ownColor="var(--wordle-correct)"
          readout={(b) => `${b.label}: ${plural(b.value, "game")}`}
        />
      )}
    </Card>
  );
}
