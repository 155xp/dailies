import type { RecordOf } from "../../../src/record";
import { Bars, Card, Figure, type CardProps } from "./frame";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const day = (iso: string, back: number) => new Date(Date.parse(iso) - back * 86_400_000).toISOString().slice(0, 10);
const short = (iso: string) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function Mini({ record, history }: CardProps) {
  const r = record as RecordOf<"mini">;
  const week = [6, 5, 4, 3, 2, 1, 0].map((back) => {
    const date = day(r.date, back);
    const time = (history.find((h) => h.date === date) as RecordOf<"mini"> | undefined)?.detail.timeSeconds ?? null;
    return { label: back === 0 ? "Today" : short(date), value: time ?? 0, time };
  });
  return (
    <Card game="mini">
      <Figure game="mini" value={r.detail.timeSeconds === null ? "Solved" : clock(r.detail.timeSeconds)} />
      {r.detail.timeSeconds !== null && (
        <Bars
          label="Your solve times this week"
          bars={week}
          own={6}
          rest="#95befa"
          ownColor="#95befa"
          readout={(b) => `${b.label}: ${(b as (typeof week)[number]).time === null ? "not logged" : clock(b.value)}`}
        />
      )}
    </Card>
  );
}
