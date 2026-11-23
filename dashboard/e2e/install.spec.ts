import { expect, test, type Page } from "@playwright/test";
import { audit, CLEAN } from "./guards";
import { open, shoot, STATES } from "./harness";

type Ext = { __ext: { set(m: unknown): void; swap(m: unknown): void } };
const steps = (page: Page) => page.locator(".install .step");

test.describe("5a install steps", () => {
  test("Extension not found shows exactly 3 plain-word steps, each with a link or button and a screenshot", async ({ page }, info) => {
    await open(page, { ext: "none" });
    await expect(page.locator(".pill")).toHaveText("Extension not found");
    await expect(steps(page)).toHaveCount(3);
    await expect(steps(page).nth(0)).toContainText(/Download the extension.*unzip/);
    await expect(steps(page).nth(1)).toContainText(/chrome:\/\/extensions.*Developer mode/);
    await expect(steps(page).nth(2)).toContainText(/Load unpacked/);

    const download = steps(page).nth(0).getByRole("link", { name: "Download the extension" });
    await expect(download).toHaveAttribute("href", /(^|\/)dailies-extension\.zip$/);
    await expect(download).toHaveAttribute("download", "");
    await expect(steps(page).nth(1).getByRole("button", { name: "Copy address" })).toBeVisible();
    await expect(steps(page).nth(2).getByRole("button", { name: "Check again" })).toBeVisible();

    const scheme = info.project.name.endsWith("dark") ? "dark" : "light";
    for (const img of await page.locator(".install .step img").all()) {
      await expect(img).toBeVisible();
      expect(await img.getAttribute("alt")).toMatch(/\w{4,}/);
      const { width, src } = await img.evaluate((e: HTMLImageElement) => ({ width: e.naturalWidth, src: e.currentSrc }));
      expect(width, src).toBeGreaterThan(0);
      expect(src).toContain(`-${scheme}.png`);
    }
    await expect(page.locator(".install .step img")).toHaveCount(3);

    // Plain words: no raw JSON, no console or DevTools steps.
    const text = await page.locator(".install").innerText();
    expect(text).not.toMatch(/[{}[\]]|"\w+":|console|devtools|terminal/i);
  });

  test("Copy address puts chrome://extensions on the clipboard and says so; a refused copy says Copy failed", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { copied: string[]; refuse: boolean };
      w.copied = [];
      w.refuse = false;
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: (s: string) => (w.refuse ? Promise.reject(new Error("no")) : (w.copied.push(s), Promise.resolve())) },
      });
    });
    await open(page, { ext: "none" });
    // Found by position, not by name: the name is what changes.
    const copy = steps(page).nth(1).locator("button");
    await expect(copy).toHaveText("Copy address");
    await copy.click();
    await expect(copy).toHaveText("Copied");
    expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual(["chrome://extensions"]);
    await expect(copy).toHaveText("Copy address", { timeout: 4000 });
    await page.evaluate(() => ((window as unknown as { refuse: boolean }).refuse = true));
    await copy.click();
    await expect(copy).toHaveText("Copy failed");
  });

  test("Check again is disabled and says Checking… while it asks, then comes back", async ({ page }) => {
    await open(page, { ext: { kind: "silent" } });
    const again = steps(page).nth(2).getByRole("button", { name: "Check again" });
    await again.click();
    await expect(steps(page).nth(2).locator("button")).toHaveText("Checking…");
    await expect(steps(page).nth(2).locator("button")).toBeDisabled();
    await expect(again).toBeEnabled({ timeout: 1000 });
    await expect(again).toHaveText("Check again");
  });

  test("a late state from the content script swaps the steps for today's rows without a reload", async ({ page }) => {
    await open(page, { ext: { kind: "silent" } });
    await expect(steps(page)).toHaveCount(3);
    await page.evaluate(() => ((window as unknown as { sameDocument: number }).sameDocument = 1));
    // The extension is installed now and its content script announces itself, unasked.
    await page.evaluate((s) => (window as never as Ext).__ext.set({ kind: "state", state: s }), STATES.partial);
    await expect(page.locator("main")).toHaveAttribute("data-status", "connected");
    await expect(page.locator(".install")).toHaveCount(0);
    await expect(page.locator('.row[data-game="wordle"] .status')).toHaveText("Played");
    await expect(page.locator(".rows .status")).toHaveCount(9);
    expect(await page.evaluate(() => (window as unknown as { sameDocument?: number }).sameDocument)).toBe(1);
  });

  test("with no fake at all, a state posted later by a newly injected content script is picked up", async ({ page }) => {
    await open(page, { ext: "none" });
    await expect(steps(page)).toHaveCount(3);
    await page.evaluate((s) => window.postMessage({ source: "dailies-extension", type: "state", version: "0.1.0", ...s }, location.origin), STATES.empty);
    await expect(page.locator(".install")).toHaveCount(0);
    await expect(page.locator(".rows .status")).toHaveText(Array(9).fill("Not played yet"));
  });

  test("coming back to the tab after installing asks again and connects", async ({ page }) => {
    await open(page, { ext: { kind: "silent" } });
    await page.evaluate((s) => (window as never as Ext).__ext.swap({ kind: "state", state: s }), STATES.done);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".install")).toHaveCount(0);
    await expect(page.locator(".pill")).toHaveText("Extension connected · last log 9:41 AM");
  });

  test("install state passes every visual guard and is captured", async ({ page }, info) => {
    await open(page, { ext: "none" });
    await page.locator(".install img").evaluateAll((imgs) => Promise.all(imgs.map((i) => (i as HTMLImageElement).decode())));
    expect(await audit(page)).toEqual(CLEAN);
    await shoot(page, info, "install");
  });
});
