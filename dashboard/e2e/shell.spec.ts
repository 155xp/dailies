import { expect, test } from "@playwright/test";
import { GAMES } from "../src/games";
import { BASE, serve } from "./harness";

test("the built site loads from a nested path on any host, with no other requests", async ({ page }) => {
  const external = await serve(page);
  await page.goto(BASE);
  await expect(page.getByRole("heading", { level: 1, name: "Dailies" })).toBeVisible();
  const links = page.locator(".row a.link");
  await expect(links).toHaveCount(9);
  expect(await links.allTextContents()).toEqual(GAMES.map((g) => g.name));
  for (const g of GAMES) {
    const a = page.locator(`.row[data-game="${g.id}"] a.link`);
    await expect(a).toHaveAttribute("href", g.url);
    await expect(a).toHaveAttribute("target", "_blank");
    await expect(a).toHaveAttribute("rel", "noopener");
  }
  expect(external).toEqual([]);
});
