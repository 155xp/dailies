import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const loopback = /localhost|127\.0\.0\.1|\[::1\]/;
function build(dev: string, origins: string) {
  execFileSync(process.execPath, ["--import", "tsx", "extension/build.ts"], {
    env: { ...process.env, DAILIES_DEV: dev, DAILIES_DASHBOARD_ORIGINS: origins },
  });
  return JSON.parse(readFileSync("extension/dist/manifest.json", "utf8")) as chrome.runtime.ManifestV3;
}

it("prod zip has only configured dashboard bridge matches and no loopback permissions", () => {
  const m = build("", "https://dailies.enci.dev");
  expect(m.host_permissions).toHaveLength(11);
  expect(m.host_permissions?.filter((s) => loopback.test(s))).toEqual([]);
  for (const script of m.content_scripts ?? []) expect(script.matches?.filter((s) => loopback.test(s))).toEqual([]);
  expect(m.content_scripts?.find((s) => s.js?.includes("bridge.js"))?.matches).toEqual(["https://dailies.enci.dev/*"]);
  const zipped = execFileSync("unzip", ["-p", "extension/dailies-extension.zip", "manifest.json"], { encoding: "utf8" });
  expect(JSON.parse(zipped)).toEqual(m);
  expect(zipped).not.toMatch(loopback);
});

it("dev zip requires the explicit flag and uses explicit loopback ports", () => {
  const m = build("1", "");
  const local = m.host_permissions?.filter((s) => loopback.test(s));
  expect(local).toEqual(["http://localhost:5173/*", "http://127.0.0.1:5173/*"]);
  expect(m.content_scripts?.find((s) => s.js?.includes("bridge.js"))?.matches).toEqual(local);
});

it("prod zip fails loudly without origins or with loopback origins", () => {
  for (const origin of ["", "http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"]) {
    expect(() => build("", origin)).toThrow(/DAILIES_DASHBOARD_ORIGINS/);
  }
});
