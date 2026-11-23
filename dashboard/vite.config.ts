import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Relative base so `dist` works from any static host and any path.
export default defineConfig({
  root: import.meta.dirname,
  base: "./",
  plugins: [react()],
  define: {
    // Where the install button points. Defaults to a zip next to the page; set at build time to change it.
    __EXTENSION_URL__: JSON.stringify(process.env.DAILIES_EXTENSION_URL || "dailies-extension.zip"),
  },
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 0 },
});
