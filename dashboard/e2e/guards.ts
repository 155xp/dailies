import type { Page } from "@playwright/test";

export interface Audit {
  /** (a) a chart or tile container with nothing drawn in it */
  empty: string[];
  /** (b) ink outside its box or the viewport, or a horizontal page scroll */
  clipped: string[];
  /** (c) a card or panel more than 35% blank */
  blank: string[];
  /** (d) the same headline or value twice in one view */
  duplicate: string[];
  /** (e) emoji, em dashes, eyebrow labels, numbered markers, self-congratulatory copy */
  banned: string[];
}

/**
 * Runs inside the page, so it must stay self-contained. Markers it reads:
 * `[data-chart]` / `[data-tiles]` for drawn containers, `[data-panel]` for cards and panels,
 * `[data-value]` for figures (its attribute is the label plus the value).
 */
function auditInPage(): Audit {
  const out: Audit = { empty: [], clipped: [], blank: [], duplicate: [], banned: [] };
  const describe = (el: Element) => {
    const t = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} "${t}"`;
  };
  const shown = (el: Element) => el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const sized = (r: DOMRect) => r.width > 0 && r.height > 0;

  const texts: { node: Text; el: Element; rects: DOMRect[] }[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || !(n.textContent ?? "").trim() || !shown(el) || el.closest("script,style")) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    texts.push({ node: n as Text, el, rects: [...range.getClientRects()].filter(sized) });
  }

  // (a) empty containers at first paint
  for (const el of document.querySelectorAll("[data-chart],[data-tiles]")) {
    if (!shown(el)) continue;
    const drawn = [...el.querySelectorAll("*")].some((k) => sized(k.getBoundingClientRect()) && shown(k));
    if (!drawn && !(el.textContent ?? "").trim()) out.empty.push(describe(el));
  }

  // (b) clipped ink
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 1) out.clipped.push(`page scrolls sideways by ${doc.scrollWidth - doc.clientWidth}px`);
  const inks: { el: Element; rect: DOMRect }[] = texts.flatMap((t) => t.rects.map((rect) => ({ el: t.el, rect })));
  for (const tile of document.querySelectorAll("[data-tiles] > *, [data-chart] *")) {
    const rect = tile.getBoundingClientRect();
    if (sized(rect) && shown(tile)) inks.push({ el: tile, rect });
  }
  for (const { el, rect } of inks) {
    let scrolled = false;
    for (let a: Element | null = el; a && a !== doc; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (/auto|scroll/.test(cs.overflowX)) {
        scrolled = true;
        break;
      }
      if (/hidden|clip/.test(cs.overflowX + cs.overflowY)) {
        const box = a.getBoundingClientRect();
        if (rect.left < box.left - 1 || rect.right > box.right + 1 || rect.top < box.top - 1 || rect.bottom > box.bottom + 1) {
          out.clipped.push(describe(el));
          break;
        }
      }
    }
    if (!scrolled && (rect.right > doc.clientWidth + 1 || rect.left < -1)) out.clipped.push(`${describe(el)} past the viewport`);
  }
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1) out.clipped.push(`${describe(el)} truncated`);
  }

  // (c) panels more than 35% blank, measured in 24px bands from top to bottom of the content box
  const BAND = 24;
  for (const panel of document.querySelectorAll("[data-panel]")) {
    if (!shown(panel)) continue;
    const box = panel.getBoundingClientRect();
    const cs = getComputedStyle(panel);
    const top = box.top + parseFloat(cs.paddingTop);
    const bottom = box.bottom - parseFloat(cs.paddingBottom);
    const filled: DOMRect[] = [];
    for (const t of texts) if (panel.contains(t.node)) filled.push(...t.rects);
    for (const k of panel.querySelectorAll("*")) {
      const kcs = getComputedStyle(k);
      const painted = kcs.backgroundColor !== "rgba(0, 0, 0, 0)" || kcs.boxShadow !== "none" || /^(svg|img|canvas)$/i.test(k.tagName);
      if (painted && shown(k)) filled.push(k.getBoundingClientRect());
    }
    const bands = Math.max(1, Math.floor((bottom - top) / BAND));
    let blank = 0;
    for (let i = 0; i < bands; i++) {
      const y0 = top + i * BAND;
      const y1 = y0 + BAND;
      if (!filled.some((r) => sized(r) && r.bottom > y0 && r.top < y1)) blank++;
    }
    if (blank / bands > 0.35) out.blank.push(`${describe(panel)} ${Math.round((blank / bands) * 100)}% blank`);
  }

  // (d) duplicates
  const seen = (items: string[], kind: string) => {
    const counts = new Map<string, number>();
    for (const s of items) counts.set(s, (counts.get(s) ?? 0) + 1);
    for (const [s, n] of counts) if (n > 1) out.duplicate.push(`${kind} "${s}" x${n}`);
  };
  const norm = (s: string) => s.trim().replace(/\s+/g, " ");
  seen([...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(shown).map((h) => norm(h.textContent ?? "")), "headline");
  seen([...document.querySelectorAll("[data-value]")].filter(shown).map((v) => norm(v.getAttribute("data-value") || v.textContent || "")), "value");

  // (e) banned copy
  const EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u{FE0F}|\u{20E3}/u;
  const PHRASES = /\b(all set|ready|nice!|crushing it|great job|well done|awesome|congrat\w*|you did it|amazing)\b/i;
  const strings: { s: string; el: Element }[] = texts.map((t) => ({ s: t.node.textContent ?? "", el: t.el }));
  for (const el of document.querySelectorAll("[aria-label],[title],[alt],[placeholder],[data-tip]")) {
    for (const attr of ["aria-label", "title", "alt", "placeholder", "data-tip"]) {
      const v = el.getAttribute(attr);
      if (v) strings.push({ s: v, el });
    }
  }
  for (const { s, el } of strings) {
    if (EMOJI.test(s)) out.banned.push(`emoji in ${describe(el)}`);
    if (s.includes("—")) out.banned.push(`em dash in ${describe(el)}`);
    if (PHRASES.test(s)) out.banned.push(`self-congratulatory copy in ${describe(el)}`);
    if (/^\s*(0\d|\d+[.)])\s/.test(s) || /\bstep \d+ of \d+\b/i.test(s)) out.banned.push(`numbered marker in ${describe(el)}`);
  }
  for (const t of texts) {
    const cs = getComputedStyle(t.el);
    const tracked = parseFloat(cs.letterSpacing) >= 0.05 * parseFloat(cs.fontSize);
    if (cs.textTransform === "uppercase" || /small-caps/.test(cs.fontVariantCaps) || tracked) out.banned.push(`eyebrow-styled ${describe(t.el)}`);
  }
  for (const li of document.querySelectorAll("li")) {
    if (shown(li) && getComputedStyle(li).display === "list-item" && getComputedStyle(li).listStyleType !== "none") out.banned.push(`list marker on ${describe(li)}`);
  }
  return out;
}

export const audit = (page: Page): Promise<Audit> => page.evaluate(auditInPage);

export const CLEAN: Audit = { empty: [], clipped: [], blank: [], duplicate: [], banned: [] };
