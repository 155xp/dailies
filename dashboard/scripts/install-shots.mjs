// Captures the install-step screenshots from a throwaway profile in headless Chromium, in light and
// dark, into dashboard/public/install/. Run by hand after a Chrome UI change:
//   node dashboard/scripts/install-shots.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const OUT = join(import.meta.dirname, "..", "public", "install");
const SIZE = { width: 280, height: 64 };

/** A throwaway Chromium profile; `run` gets the context and a scratch folder, both removed after. */
async function withProfile(colorScheme, run) {
  const scratch = mkdtempSync(join(tmpdir(), "dailies-shots-"));
  const context = await chromium.launchPersistentContext(join(scratch, "profile"), { channel: "chromium", headless: true, viewport: { width: 1280, height: 400 }, deviceScaleFactor: 2, colorScheme });
  try {
    return await run(context, scratch);
  } finally {
    await context.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}

const shot = (page, out, name, colorScheme, x, y) => page.screenshot({ path: join(out, `${name}-${colorScheme}.png`), clip: { x, y, ...SIZE } });

/**
 * Step 1: the zip in Chrome's download list. The zip is a blob made by a page with no origin, so
 * Chrome has no source to show under the file name and no host ends up in the picture. The item's
 * rendered text and markup are checked for a URL before the shot, and returned for tests.
 */
export function captureDownload(colorScheme, out = OUT) {
  mkdirSync(out, { recursive: true });
  return withProfile(colorScheme, async (context, scratch) => {
    const site = context.pages()[0];
    const cdp = await context.newCDPSession(site);
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: join(scratch, "downloads") });
    await site.setContent(
      '<a download="dailies-extension.zip">zip</a><script>document.querySelector("a").href = URL.createObjectURL(new Blob([new Uint8Array(32000)], { type: "application/zip" }))</script>',
    );
    await site.click("a");
    await site.waitForTimeout(1000);

    const downloads = await context.newPage();
    await downloads.goto("chrome://downloads");
    const item = downloads.locator("downloads-item");
    await item.waitFor();
    await downloads.mouse.click(1200, 380);
    const text = await item.evaluate((e) => e.shadowRoot.querySelector("#details").innerText);
    const html = await item.evaluate((e) => e.shadowRoot.querySelector("#details").innerHTML);
    if (/http|:\/\//i.test(text + html)) throw new Error(`the download item shows a URL: ${text}`);
    await shot(downloads, out, "download", colorScheme, 310, 120);
    return { text, html };
  });
}

/** Steps 2 and 3: chrome://extensions at a narrow width, Developer mode on. */
export function captureExtensions(colorScheme, out = OUT) {
  mkdirSync(out, { recursive: true });
  return withProfile(colorScheme, async (context) => {
    const extensions = context.pages()[0];
    await extensions.setViewportSize({ width: 480, height: 300 });
    await extensions.goto("chrome://extensions");
    await extensions.locator("#devMode").click();
    await extensions.waitForTimeout(600);
    await shot(extensions, out, "devmode", colorScheme, 200, 0);
    await shot(extensions, out, "unpacked", colorScheme, 16, 48);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  for (const colorScheme of ["light", "dark"]) {
    await captureDownload(colorScheme);
    await captureExtensions(colorScheme);
  }
}
