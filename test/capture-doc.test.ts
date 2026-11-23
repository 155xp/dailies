import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");
const doc = readFileSync(join(ROOT, "docs", "CAPTURE.md"), "utf8");
const rows = doc.split("\n").filter((l) => /^\| \d+ \|/.test(l));

/** Expand a `fixtures/<game>/*` style path, where `*` stands for every case directory. */
function expand(path: string): string[] {
  const parts = path.split("/");
  const star = parts.indexOf("*");
  if (star < 0) return [path];
  const base = parts.slice(0, star).join("/");
  return readdirSync(join(ROOT, base)).map((d) => [base, d, ...parts.slice(star + 1)].join("/"));
}

describe("docs/CAPTURE.md", () => {
  it("has a row for each of the 15 UNVERIFIED items", () => {
    expect(rows).toHaveLength(15);
  });

  it("gives every row a result and a fixture source that exists", () => {
    for (const row of rows) {
      expect(row).toMatch(/\| (CONFIRMED|CORRECTED|UNVERIFIED)[^|]* \|/);
      const paths = [...row.matchAll(/`(fixtures\/[^`]+?)`/g)].map((m) => m[1]!.replace(/\/\.\.\.\//, "/"));
      expect(paths.length, row).toBeGreaterThan(0);
      for (const p of paths.flatMap(expand)) expect(existsSync(join(ROOT, p)), p).toBe(true);
    }
  });
});
