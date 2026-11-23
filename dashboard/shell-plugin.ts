import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { transform } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Plugin } from "vite";
import { GAMES } from "./src/games";
import { Install } from "./src/Install";
import { HINT, predict, SHELL_KEY, WHAT } from "./src/shell";

/**
 * Size-adjust for the fallback face (Arial, or its metric twin Liberation Sans), measured against
 * Schibsted Grotesk on the shell with the hidden install copy, sweeping 98% to 109% at widths 320 to 1440:
 * from 768px up every width matches at 98% to 102.5%; below it 390, 414, 480 and 700 need 103% or more and
 * 360, 375, 540, 600 and 767 take any. 430 needs under 103%, and at 320 no single size matches: there the
 * reserved install room can differ by a line (26px) when the font lands.
 */
const FALLBACK_ADJUST = { desktop: "100.5%", phone: "105%" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A played row's two lines at 390, for the rows the snapshot names while the app loads. */
const TWO_LINES = `{grid-template-rows:26px minmax(36px,auto);grid-template-areas:"name status disc" "strip result result";min-height:56px}`;

/**
 * Reads the snapshot right after the header, before anything it decides is parsed: marks <html> with what
 * to reserve (shell.ts), and gives the rows played today their second line at 390. Only plain game ids
 * reach the style it writes. The header doesn't depend on it, so it can paint from the first bytes.
 */
const inlineScript = () =>
  `(()=>{try{const d=new Date(),p=n=>String(n).padStart(2,"0"),r=(${predict.toString()})(localStorage.getItem(${JSON.stringify(SHELL_KEY)}),d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate())),ids=r.played.filter(i=>/^[a-z-]+$/.test(i));document.documentElement.dataset.shell=r.state;if(ids.length)document.head.insertAdjacentHTML("beforeend","<style>@media (max-width:767px){"+ids.map(i=>'[aria-busy="true"] [data-game="'+i+'"]>.line').join()+${JSON.stringify(TWO_LINES)}+"}</style>")}catch(e){}})()`;

/** The app's loading view, as static markup: the header, the install card's room, Today, and a row per game. */
function shellMarkup(script: string, afterHeader: string) {
  const icon = renderToStaticMarkup(createElement(HugeiconsIcon, { icon: LinkSquare02Icon, size: 16, strokeWidth: 1.5, "aria-hidden": "true" }));
  const install = renderToStaticMarkup(createElement(Install, { check: () => {}, checking: false, leaving: false, placeholder: true }));
  const rows = GAMES.map(
    (g) =>
      `<li class="row" data-game="${g.id}"><div class="line"><a class="link name" href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.name)}${icon}</a><span class="skel status-skel"></span></div></li>`,
  ).join("");
  return (
    `<main class="page shell" aria-busy="true">` +
    `<header class="head"><h1 class="title">Dailies</h1><span class="pill skel" aria-hidden="true"></span><p class="what quiet">${esc(WHAT)}</p></header>` +
    `<script>${script}</script><style>${afterHeader}</style>` +
    install +
    `<section class="today" aria-labelledby="today-title"><div class="today-head"><h2 class="section-title" id="today-title">Today</h2><p class="meta"><span class="skel date-skel"></span></p></div>` +
    `<p class="hint quiet">${esc(HINT)}</p><ul class="rows">${rows}</ul></section></main>`
  );
}

/**
 * dailies#16: index.html ships the app's loading view as static HTML with its critical CSS inline, so a slow
 * network paints the page from its first bytes instead of after the JS. In order: the header's CSS in <head>,
 * the header, the snapshot script, the rest of the shell's CSS and the shell; then the full stylesheet, the
 * font preload and the app's scripts at the end of <body>, where they no longer hold back the first paint or
 * share its bandwidth.
 */
export const staticShell = (): Plugin => ({
  name: "static-shell",
  transformIndexHtml: {
    order: "post",
    async handler(html, ctx) {
      if (ctx.path !== "/index.html") return html;
      const font = Object.values(ctx.bundle ?? {}).find((a) => /schibsted-grotesk-latin-400-normal-[\w-]+\.woff2$/.test(a.fileName))?.fileName;
      const css = readFileSync(join(import.meta.dirname, "src", "shell.css"), "utf8")
        .replace("__ADJUST_DESKTOP__", FALLBACK_ADJUST.desktop)
        .replace("__ADJUST_PHONE__", FALLBACK_ADJUST.phone);
      const [head = "", afterHeader = ""] = await Promise.all(css.split("/* @@after-header */").map(async (part) => (await transform(part, { loader: "css", minify: true })).code.trim()));
      const script = (await transform(inlineScript(), { loader: "js", minify: true })).code.trim();
      // Everything else the page fetches goes after the shell, so none of it shares the first bytes' bandwidth.
      const late: string[] = [];
      const take = (re: RegExp) => (html = html.replace(re, (tag) => (late.push(tag.trim()), "")));
      take(/\s*<link rel="stylesheet"[^>]*>/g);
      if (font) late.push(`<link rel="preload" href="./${font}" as="font" type="font/woff2" crossorigin>`);
      take(/\s*<link rel="modulepreload"[^>]*>/g);
      take(/\s*<script type="module"[^>]*><\/script>/g);
      return html
        .replace("<title>", `<style>${head}</style>\n    <title>`)
        .replace('<div id="root"></div>', `<div id="root">${shellMarkup(script, afterHeader)}</div>`)
        .replace("</body>", `${late.map((s) => `  ${s}\n`).join("")}  </body>`);
    },
  },
});
