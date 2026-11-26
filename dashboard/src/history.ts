const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar day of a Date, as YYYY-MM-DD. */
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A YYYY-MM-DD day as a local Date at noon (safe across DST). */
export const dayDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12);
};

/** "Sunday, November 22" in the reader's locale. */
export const longDay = (day: string) => dayDate(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

/** The day `by` days after `day` (negative for before). */
export const shift = (day: string, by: number) => {
  const d = dayDate(day);
  d.setDate(d.getDate() + by);
  return localDay(d);
};

/** The last `n` days ending at `today`, oldest first. */
export const lastDays = (today: string, n: number) => Array.from({ length: n }, (_, i) => shift(today, i - n + 1));

/** Current streak runs through today, or through yesterday while today is still open. Best is the longest run. */
export function streaks(days: Iterable<string>, today: string): { current: number; best: number } {
  const set = new Set(days);
  let best = 0;
  for (const day of set) {
    if (set.has(shift(day, -1))) continue;
    let run = 1;
    while (set.has(shift(day, run))) run++;
    best = Math.max(best, run);
  }
  let cursor = set.has(today) ? today : shift(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = shift(cursor, -1);
  }
  return { current, best };
}
