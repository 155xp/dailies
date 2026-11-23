import react from "@vitejs/plugin-react";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { fixtureRecords } from "./fixture-records";
import { staticShell } from "./shell-plugin";

/** `virtual:card-fixtures`: the fixture records, parsed at build time by the real parsers, for the cards preview. */
const cardFixtures = (): Plugin => ({
  name: "card-fixtures",
  resolveId: (id) => (id === "virtual:card-fixtures" ? "\0card-fixtures" : null),
  load: (id) => (id === "\0card-fixtures" ? `export default ${JSON.stringify(fixtureRecords())};` : null),
});

// Relative base so `dist` works from any static host and any path.
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react(), cardFixtures(), staticShell()],
  define: {
    // Where the install button points. Defaults to a zip next to the page; set at build time to change it.
    __EXTENSION_URL__: JSON.stringify(process.env.DAILIES_EXTENSION_URL || "dailies-extension.zip"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: { input: { main: join(import.meta.dirname, "index.html"), cards: join(import.meta.dirname, "cards/index.html") } },
  },
});
