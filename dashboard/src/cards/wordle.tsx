import type { RecordOf } from "../../../src/record";
import { Bars, Card, Figure, plural, type CardProps } from "./frame";

const LABELS = ["1", "2", "3", "4", "5", "6", "X"];
const slot = (r: RecordOf<"wordle">) => (r.status === "won" ? r.detail.guesses.length - 1 : 6);

export function Wordle({ record, history }: CardProps) {
  const r = record as RecordOf<"wordle">;
  const counts = LABELS.map((_, i) => history.filter((h) => slot(h as RecordOf<"wordle">) === i).length);
  const rows = Array.from({ length: 6 }, (_, i) => r.detail.guesses[i] ?? "");
  return (
    <Card game="wordle">
      <Figure game="wordle" value={`${r.status === "won" ? r.detail.guesses.length : "X"}/6`} label={r.detail.hardMode ? <span className="meta">Hard mode</span> : undefined} />
      <div className="wordle" data-tiles role="img" aria-label={`Guesses: ${r.detail.guesses.join(", ")}`}>
        {rows.flatMap((word, row) =>
          Array.from({ length: 5 }, (_, i) => (
            <i key={`${row}-${i}`} className="tile" data-tile data-mark={r.detail.evaluations[row]?.[i] ?? "empty"}>
              {word[i]?.toUpperCase()}
            </i>
          )),
        )}
      </div>
      <Bars
        label="Your guess distribution"
        bars={counts.map((n, i) => ({ label: i === 6 ? "X" : plural(i + 1, "guess", "guesses"), value: n }))}
        own={slot(r)}
        ownColor="var(--wordle-correct)"
        readout={(b) => `${b.label}: ${plural(b.value, "game")}`}
      />
    </Card>
  );
}
