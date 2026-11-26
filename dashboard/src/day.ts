import { useCallback, useEffect, useState } from "react";
import { dayDate, localDay, longDay, shift } from "./history";

/** The selected day lives in `?day=YYYY-MM-DD`; today has no parameter, so a bookmark of the page stays on today. */
const PARAM = "day";

/** A real calendar day no later than today, or today. */
export function clampDay(value: string | null, today: string): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || localDay(dayDate(value)) !== value) return today;
  return value > today ? today : value;
}

/** The page's own URL with `day` set, or dropped for today. */
export function dayHref(day: string, today: string): string {
  const url = new URL(location.href);
  if (day === today) url.searchParams.delete(PARAM);
  else url.searchParams.set(PARAM, day);
  url.hash = "";
  return url.pathname + url.search;
}

const fromUrl = () => new URLSearchParams(location.search).get(PARAM);

/**
 * The day the dashboard shows, read from and written to the URL. `push` adds a history entry; a step replaces it.
 * It holds what the URL asks for, not a resolved day, so with no `day` the view follows today past midnight.
 */
export function useDay(today: string) {
  const [asked, setAsked] = useState(fromUrl);
  const day = clampDay(asked, today);

  useEffect(() => {
    // A future or malformed day falls back to today; say so in the URL too.
    const url = fromUrl();
    if (url !== null && url !== clampDay(url, today)) history.replaceState(history.state, "", dayHref(today, today));
    const onPop = () => setAsked(fromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [today]);

  const go = useCallback(
    (next: string, how: "push" | "replace" = "replace") => {
      const to = clampDay(next, today);
      if (how === "push") history.pushState(null, "", dayHref(to, today));
      else history.replaceState(history.state, "", dayHref(to, today));
      setAsked(to === today ? null : to);
    },
    [today],
  );

  const step = useCallback((by: number) => go(shift(day, by)), [day, go]);
  return { day, go, step };
}

const daysBetween = (from: string, to: string) => Math.round((dayDate(to).getTime() - dayDate(from).getTime()) / 86_400_000);

/** The section title: Today, Yesterday, or the date itself (with its year once it is not this year's). */
export function dayTitle(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === shift(today, -1)) return "Yesterday";
  return day.slice(0, 4) === today.slice(0, 4) ? longDay(day) : dayDate(day).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/** The line under the title: the date under Today and Yesterday, how long ago under a date. */
export const dayMeta = (day: string, today: string) => (daysBetween(day, today) < 2 ? longDay(day) : `${daysBetween(day, today)} days ago`);
