export interface Hive {
  /** The seven letters, lowercase; `letters[0]` is drawn in the middle cell, the rest go round it. */
  letters: string[];
  /** Whether `letters[0]` is the known center letter, the one every found word shares. */
  center: boolean;
}

const set = (w: string) => new Set(w.toLowerCase());

/**
 * The day's hive, from the record alone. The letters come from the pangram; the center is the one
 * letter every found word shares. Null when the letters can't be known: no pangram, pangrams that
 * disagree, a pangram without exactly seven letters, or a found word that uses another letter.
 */
export function hive(words: string[], pangrams: string[]): Hive | null {
  const [first, ...rest] = pangrams.map(set);
  if (!first || first.size !== 7) return null;
  const letters = [...first].sort();
  const key = letters.join("");
  if (rest.some((p) => [...p].sort().join("") !== key)) return null;
  const found = [...words, ...pangrams].map(set);
  if (found.some((w) => [...w].some((c) => !first.has(c)))) return null;
  const shared = letters.filter((c) => found.every((w) => w.has(c)));
  if (shared.length !== 1) return { letters, center: false };
  return { letters: [shared[0]!, ...letters.filter((c) => c !== shared[0])], center: true };
}
