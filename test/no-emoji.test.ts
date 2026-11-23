import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PARSERS } from "../src/parsers";
import { loadCapture } from "./capture";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u{FE0F}|\u{20E3}|[\u{1F3FB}-\u{1F3FF}]/u;

/** Paths of every key or string value in `value` that holds an emoji code point. */
function emojiPaths(value: unknown, path = "$"): string[] {
  if (typeof value === "string") return EMOJI.test(value) ? [path] : [];
  if (Array.isArray(value)) return value.flatMap((v, i) => emojiPaths(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => [...(EMOJI.test(k) ? [`${path} key ${k}`] : []), ...emojiPaths(v, `${path}.${k}`)]);
  }
  return [];
}

describe("no share emoji in records", () => {
  it("catches emoji in any field, at any depth", () => {
    expect(emojiPaths({ score: 3, detail: { rows: ["ok", "🟩🟨⬜"], note: "fine" } })).toEqual(["$.detail.rows[1]"]);
    expect(emojiPaths({ detail: { "✅": 1 } })).toEqual(["$.detail key ✅"]);
    expect(emojiPaths({ a: "#1 *2 Türkiye", b: 0 })).toEqual([]);
  });

  for (const game of readdirSync(FIXTURES)) {
    for (const dir of readdirSync(join(FIXTURES, game))) {
      it(`${game}/${dir} record has no emoji`, () => {
        const record = PARSERS[game as keyof typeof PARSERS](loadCapture(game, dir));
        expect(emojiPaths(record)).toEqual([]);
      });
    }
  }
});
