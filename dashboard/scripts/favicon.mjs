// Renders public/favicon.svg at 32px and wraps the PNG in public/favicon.ico. Run: node dashboard/scripts/favicon.mjs
import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const pub = join(import.meta.dirname, "..", "public");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 32, height: 32 }, colorScheme: "light" });
await page.setContent(`<style>body{margin:0}</style>${readFileSync(join(pub, "favicon.svg"), "utf8").replace("<svg", '<svg width="32" height="32"')}`);
const png = await page.screenshot({ omitBackground: true });
await browser.close();

// An ICO holding one 32x32 PNG: 6-byte header, one 16-byte directory entry, then the PNG.
const head = Buffer.alloc(22);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(1, 4);
head.writeUInt8(32, 6);
head.writeUInt8(32, 7);
head.writeUInt16LE(1, 10);
head.writeUInt16LE(32, 12);
head.writeUInt32LE(png.length, 14);
head.writeUInt32LE(22, 18);
writeFileSync(join(pub, "favicon.ico"), Buffer.concat([head, png]));
