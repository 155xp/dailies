import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build, type Plugin } from "esbuild";
import { buildManifest } from "./src/manifest";

const ROOT = import.meta.dirname;
export const VERSION = "0.1.0";

/**
 * Zod re-exports all ~40 of its error-message locales, which is most of its size. The extension only ever
 * uses the default English one, so the locale index resolves to English alone.
 */
const englishOnly: Plugin = {
  name: "zod-english-only",
  setup(b) {
    b.onResolve({ filter: /locales\/index\.js$/ }, (args) =>
      /[\\/]zod[\\/]/.test(args.importer) ? { path: join(args.resolveDir, "..", "locales", "en.js") } : undefined,
    );
  },
};

/** Bundle the scripts, copy the popup and static files, and write the manifest into `outdir`. */
export async function bundle({ outdir, dashboardOrigins }: { outdir: string; dashboardOrigins?: string }) {
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });
  const src = (f: string) => join(ROOT, "src", f);
  await build({
    entryPoints: {
      hook: src("hook.ts"),
      content: src("content.ts"),
      background: src("background.ts"),
      bridge: src("bridge.ts"),
      popup: src("popup/popup.ts"),
    },
    outdir,
    bundle: true,
    format: "iife",
    target: "chrome120",
    charset: "utf8",
    legalComments: "none",
    minify: true,
    plugins: [englishOnly],
    logLevel: "warning",
  });
  cpSync(src("popup/popup.html"), join(outdir, "popup.html"));
  cpSync(src("popup/popup.css"), join(outdir, "popup.css"));
  cpSync(join(ROOT, "static"), outdir, { recursive: true });
  const manifest = buildManifest({ version: VERSION, ...(dashboardOrigins !== undefined && { dashboardOrigins }) });
  writeFileSync(join(outdir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const outdir = join(ROOT, "dist");
  const zip = resolve(ROOT, "dailies-extension.zip");
  await bundle({ outdir, dashboardOrigins: process.env.DAILIES_DASHBOARD_ORIGINS ?? "" });
  rmSync(zip, { force: true });
  execFileSync("zip", ["-qrX", zip, "."], { cwd: outdir });
  console.log(`built ${outdir} and ${zip}`);
}
