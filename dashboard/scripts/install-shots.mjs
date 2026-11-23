// Captures the three install-step screenshots from a throwaway profile in headless Chromium, in light
// and dark, into dashboard/public/install/. Run by hand after a Chrome UI change:
//   node dashboard/scripts/install-shots.mjs
import { chromium } from "@playwright/test";
import { Buffer } from "node:buffer";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const OUT = join(import.meta.dirname, "..", "public", "install");
const SIZE = { width: 280, height: 64 };
mkdirSync(OUT, { recursive: true });

for (const colorScheme of ["light", "dark"]) {
  const scratch = mkdtempSync(join(tmpdir(), "dailies-shots-"));
  const context = await chromium.launchPersistentContext(join(scratch, "profile"), { channel: "chromium", headless: true, viewport: { width: 1280, height: 400 }, deviceScaleFactor: 2, colorScheme });
  const shot = (page, name, x, y) => page.screenshot({ path: join(OUT, `${name}-${colorScheme}.png`), clip: { x, y, ...SIZE } });

  // Step 1: the zip in Chrome's download list, served from localhost.
  await context.route("http://localhost/**", (route) =>
    route.request().url().endsWith(".zip")
      ? route.fulfill({ body: Buffer.alloc(32000), headers: { "content-type": "application/zip", "content-disposition": "attachment; filename=dailies-extension.zip" } })
      : route.fulfill({ body: '<a href="/dailies-extension.zip">zip</a>', contentType: "text/html" }),
  );
  const site = context.pages()[0];
  const cdp = await context.newCDPSession(site);
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: join(scratch, "downloads") });
  await site.goto("http://localhost/");
  await site.click("a");
  await site.waitForTimeout(1000);
  const downloads = await context.newPage();
  await downloads.goto("chrome://downloads");
  await downloads.locator("downloads-item").waitFor();
  await downloads.mouse.click(1200, 380);
  await shot(downloads, "download", 310, 132);

  // Steps 2 and 3: chrome://extensions at a narrow width, Developer mode on.
  const extensions = await context.newPage();
  await extensions.setViewportSize({ width: 480, height: 300 });
  await extensions.goto("chrome://extensions");
  await extensions.locator("#devMode").click();
  await extensions.waitForTimeout(600);
  await shot(extensions, "devmode", 200, 0);
  await shot(extensions, "unpacked", 16, 48);

  await context.close();
  rmSync(scratch, { recursive: true, force: true });
}
