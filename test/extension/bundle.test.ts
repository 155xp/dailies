import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { bundle } from "../../extension/build";

let dir: string;
let code: Record<string, string>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "dailies-ext-"));
  await bundle({ outdir: dir });
  code = Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith(".js"))
      .map((f) => [f, readFileSync(join(dir, f), "utf8")]),
  );
}, 30_000);

const count = (src: string, re: RegExp) => src.match(new RegExp(re.source, "g"))?.length ?? 0;

describe("built extension", () => {
  it("builds every script the manifest names", () => {
    expect(Object.keys(code).sort()).toEqual(["background.js", "bridge.js", "content.js", "hook.js", "popup.js"]);
  });

  it("has no polling, alarms or request interception anywhere", () => {
    for (const [file, src] of Object.entries(code)) {
      for (const banned of [/\bsetInterval\b/, /\balarms\b/, /\bwebRequest\b/, /\brequestAnimationFrame\b/, /\bkeepAlive\b/i]) {
        expect(count(src, banned), `${banned} in ${file}`).toBe(0);
      }
    }
  });

  it("uses one setTimeout in total: the content script's 2s 'played, not logged' check", () => {
    expect(count(code["content.js"]!, /\bsetTimeout\(/)).toBe(1);
    for (const file of ["background.js", "bridge.js", "hook.js", "popup.js"]) expect(count(code[file]!, /\bsetTimeout\b/), file).toBe(0);
  });

  it("makes no network requests of its own outside the page hooks", () => {
    for (const file of ["background.js", "bridge.js", "content.js", "popup.js"]) {
      expect(count(code[file]!, /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/), file).toBe(0);
    }
  });

  it("writes the manifest next to the scripts", () => {
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { background: unknown };
    expect(manifest.background).toEqual({ service_worker: "background.js", type: "module" });
  });
});
