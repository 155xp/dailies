import type { Page } from "@playwright/test";

export type Guard = "empty" | "clipped" | "blank" | "duplicate" | "copy" | "type";
export interface Violation {
  guard: Guard;
  detail: string;
}

/**
 * The visual guards, run in the page. Containers opt in with `data-guard="chart" | "tiles" | "panel"`.
 * empty: a chart or tile container with no painted child.
 * clipped: text or tiles overflowing their box or the viewport, or a horizontal page scroll.
 * blank: a panel whose children cover less than 65% of its content box.
 * duplicate: the same headline twice, or the same `data-guard="value"` twice, in one view.
 * copy: emoji, em dashes, eyebrow labels (uppercase or tracked small text) and self-congratulatory phrases.
 * type: visible text under 13px.
 */
export function checkGuards(page: Page): Promise<Violation[]> {
  return page.evaluate(() => {
    const out: { guard: string; detail: string }[] = [];
    const add = (guard: string, el: Element | null, why: string) =>
      out.push({ guard, detail: `${why}${el ? `: ${(el.textContent ?? "").trim().slice(0, 40) || el.tagName}` : ""}` });
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && Number(s.opacity) > 0;
    };
    const textEls = [...document.body.querySelectorAll("*")].filter(
      (el) => visible(el) && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim()),
    );

    for (const el of document.querySelectorAll('[data-guard="chart"], [data-guard="tiles"]')) {
      if (![...el.querySelectorAll("*")].some(visible)) add("empty", el, "empty container");
    }

    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw) add("clipped", null, `page scrolls sideways (${document.documentElement.scrollWidth} > ${vw})`);
    for (const el of [...textEls, ...[...document.querySelectorAll('[data-guard="tiles"] > *')].filter(visible)]) {
      const r = el.getBoundingClientRect();
      if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== "visible") add("clipped", el, "text overflows its box");
      if (r.left < -1 || r.right > vw + 1) add("clipped", el, "ink outside the viewport");
      const parent = el.parentElement?.getBoundingClientRect();
      if (parent && (r.right > parent.right + 1 || r.left < parent.left - 1)) add("clipped", el, "ink outside its parent");
    }

    for (const panel of document.querySelectorAll('[data-guard="panel"]')) {
      const s = getComputedStyle(panel);
      const box = panel.getBoundingClientRect();
      const left = box.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth);
      const top = box.top + parseFloat(s.paddingTop) + parseFloat(s.borderTopWidth);
      const w = box.width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth);
      const h = box.height - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom) - parseFloat(s.borderTopWidth) - parseFloat(s.borderBottomWidth);
      const kids = [...panel.children].filter(visible).map((c) => c.getBoundingClientRect());
      let blank = 0;
      let total = 0;
      for (let y = top + 2; y < top + h; y += 4) {
        for (let x = left + 2; x < left + w; x += 4) {
          total++;
          if (!kids.some((k) => x >= k.left && x <= k.right && y >= k.top && y <= k.bottom)) blank++;
        }
      }
      if (total && blank / total > 0.35) add("blank", panel, `panel ${Math.round((100 * blank) / total)}% blank`);
    }

    const seen = (els: Element[], what: string) => {
      const texts = new Map<string, number>();
      for (const el of els.filter(visible)) texts.set(el.textContent!.trim(), (texts.get(el.textContent!.trim()) ?? 0) + 1);
      for (const [t, n] of texts) if (n > 1) out.push({ guard: "duplicate", detail: `${what} "${t}" shown ${n} times` });
    };
    seen([...document.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]")], "headline");
    seen([...document.querySelectorAll('[data-guard="value"]')], "value");

    const copy = document.body.innerText + " " + [...document.querySelectorAll("[aria-label], [title], [alt]")]
      .map((e) => `${e.getAttribute("aria-label") ?? ""} ${e.getAttribute("title") ?? ""} ${e.getAttribute("alt") ?? ""}`)
      .join(" ");
    if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u{FE0F}/u.test(copy)) add("copy", null, "emoji in copy");
    if (copy.includes("—")) add("copy", null, "em dash in copy");
    const phrase = copy.match(/\b(all set|ready|nice!|crushing it|great job|well done|awesome|you did it)/i);
    if (phrase) add("copy", null, `self-congratulatory copy "${phrase[0]}"`);
    for (const el of textEls) {
      const s = getComputedStyle(el);
      const tracked = parseFloat(s.letterSpacing) / parseFloat(s.fontSize) >= 0.05;
      if (s.textTransform === "uppercase" || (tracked && parseFloat(s.fontSize) <= 14)) add("copy", el, "eyebrow-styled label");
      if (parseFloat(s.fontSize) < 13) add("type", el, `text at ${s.fontSize}`);
    }
    return out;
  }) as Promise<Violation[]>;
}
