import { expect, test, type Page } from "@playwright/test";
import { GAMES } from "../src/games";
import { open, STATES, withState } from "./harness";

type Ext = { __ext: { requests: number; detach(): void; swap(m: unknown): void } };
const requests = (page: Page) => page.evaluate(() => (window as never as Ext).__ext.requests);

test.describe("3b extension states", () => {
  test("no extension: Extension not found, the install steps and one install action, no fake data", async ({ page }) => {
    const { external } = await open(page, { ext: "none" });
    await expect(page.locator("main")).toHaveAttribute("data-status", "missing");
    await expect(page.locator(".pill")).toHaveText("Extension not found");
    const install = page.locator(".install");
    await expect(install.getByRole("link", { name: "Download the extension" })).toHaveAttribute("href", /dailies-extension\.zip$/);
    await expect(page.locator(".primary")).toHaveCount(1);
    await expect(install).toContainText("Load unpacked");
    await expect(page.locator(".rows > .row")).toHaveCount(GAMES.length);
    await expect(page.locator(".rows .status, .rows [data-tiles], .rows .result")).toHaveCount(0);
    await expect(page.locator(".history")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toMatch(/[{}[\]]|"\w+":/);
    expect(external).toEqual([]);
  });

  test("connected: the pill reads Extension connected · last log 9:41 AM", async ({ page }) => {
    await open(page, { ext: withState(STATES.partial) });
    await expect(page.locator(".pill")).toHaveText("Extension connected · last log 9:41 AM");
    await expect(page.locator(".pill svg")).toHaveCount(1);
  });

  test("a disconnect shows within one message round trip, found by re-asking on focus, not by polling", async ({ page }) => {
    await open(page, { ext: withState(STATES.partial) });
    const settled = await requests(page);
    await page.waitForTimeout(1500);
    expect(await requests(page)).toBe(settled);
    await page.evaluate(() => (window as never as Ext).__ext.detach());
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator(".pill")).toHaveText("Extension not found", { timeout: 600 });
  });

  test("re-asks when the tab becomes visible and picks up storage changes as they are posted", async ({ page }) => {
    await open(page, { ext: withState(STATES.empty) });
    const before = await requests(page);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(await requests(page)).toBe(before + 1);
    await page.evaluate((s) => (window as never as { __ext: { set(m: unknown): void } }).__ext.set({ kind: "state", state: s }), STATES.partial);
    await expect(page.locator('.row[data-game="wordle"] .status')).toHaveText("Played");
  });

  test("empty: connected with nothing logged shows plain Not played yet rows, no hero", async ({ page }) => {
    await open(page, { ext: withState(STATES.empty) });
    await expect(page.locator(".rows .status")).toHaveText(Array(GAMES.length).fill("Not played yet"));
    await expect(page.locator(".pill")).toHaveText("Extension connected");
    await expect(page.locator("h2")).toHaveText(["Today", "History"]);
  });

  test("error: Couldn't read today's results with Try again, which recovers", async ({ page }) => {
    await open(page, { ext: { kind: "invalid" } });
    await expect(page.locator("main")).toHaveAttribute("data-status", "error");
    await expect(page.getByText("Couldn't read today's results")).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/[{}[\]]|not a list/);
    await page.evaluate((s) => (window as never as Ext).__ext.swap({ kind: "state", state: s }), STATES.partial);
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.locator("main")).toHaveAttribute("data-status", "connected");
  });
});
