import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..", "src");
const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((f) => /\.(css|tsx?)$/.test(f));
const css = files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(SRC, f), "utf8")).join("\n");
const ms = (v: string) => (v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000);

/** Every `transition` and `animation` declaration, outside the reduced-motion block. */
const [motionCss = "", reducedCss = ""] = css.split("@media (prefers-reduced-motion: reduce)");
const decls = (prop: string, from: string) => [...from.matchAll(new RegExp(`(?<![-\\w])${prop}:\\s*([^;]+);`, "g"))].map((m) => m[1]!);

describe("house motion standard", () => {
  it("never uses transition: all, in any source file", () => {
    for (const f of files) expect(readFileSync(join(SRC, f), "utf8"), f).not.toMatch(/transition(-property)?:\s*all\b|transition:\s*\d/);
  });

  it("only animates transform and opacity, plus color on hover", () => {
    const allowed = /^(transform|opacity|color|background-color|text-decoration-color)$/;
    const props = decls("transition", motionCss).flatMap((d) => d.split(",").map((p) => p.trim().split(/\s+/)[0]!));
    expect(props.length).toBeGreaterThan(0);
    for (const p of props) expect(p).toMatch(allowed);
    for (const kf of motionCss.matchAll(/@keyframes [\w-]+\s*{([\s\S]*?)}\s*}/g)) {
      for (const p of kf[1]!.matchAll(/([\w-]+):/g)) expect(p[1]).toMatch(/^(transform|opacity)$/);
    }
  });

  it("keeps every duration between 100 and 400ms", () => {
    const times = [...decls("transition", css), ...decls("animation", css)].flatMap((d) => [...d.matchAll(/(\d*\.?\d+m?s)\b/g)].map((m) => ms(m[1]!)));
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) {
      expect(t).toBeGreaterThanOrEqual(100);
      expect(t).toBeLessThanOrEqual(400);
    }
  });

  it("enters in 150 to 250ms on the strong ease-out, exits faster", () => {
    for (const a of decls("animation", motionCss)) {
      expect(a).toMatch(/var\(--ease\)/);
      expect(ms(a.match(/(\d+m?s)/)![1]!)).toBeGreaterThanOrEqual(150);
      expect(ms(a.match(/(\d+m?s)/)![1]!)).toBeLessThanOrEqual(250);
    }
    expect(css).toMatch(/--ease:\s*cubic-bezier\(0?\.23,\s*1,\s*0?\.32,\s*1\)/);
  });

  it("presses buttons to .97 and rows to .99", () => {
    expect(motionCss).toMatch(/:active[^{]*{[^}]*transform:\s*scale\(0?\.97\)/);
    expect(motionCss).toMatch(/:active[^{]*{[^}]*transform:\s*scale\(0?\.99\)/);
  });

  it("swaps to a 150ms fade with no scale or travel under reduced motion", () => {
    expect(reducedCss).not.toBe("");
    expect(reducedCss).toMatch(/transform:\s*none/);
    expect(reducedCss).toMatch(/150ms/);
    expect(reducedCss).not.toMatch(/scale\(|translate/);
  });
});
