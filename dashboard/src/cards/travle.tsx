import { useMemo, useState, type PointerEvent } from "react";
import type { RecordOf } from "../../../src/record";
import type { Country } from "./geo";
import { Bars, Caption, Card, Figure, fmt, inkOn, plural, Side, type CardProps } from "./frame";
import { AnswerRow, geoState, MapBox, useGeo, type Geo } from "./geo-view";
import { playerRoute } from "./travle-route";

/**
 * The four rating roles. Travle draws ratings as emoji only and has no rating hex (docs/CAPTURE.md #4),
 * so these are role colors in the emoji's hues: on route, near route, small detour, big detour.
 */
export const RATINGS = { perfect: "#3f9b4a", "near-perfect": "#a3d977", good: "#f5a142", poor: "#e5534b" } as const;
type Rating = keyof typeof RATINGS;
/** What each rating means, from the game's own help text. */
const WORDS: Record<Rating, string> = { perfect: "On the route", "near-perfect": "On a route, not linked", good: "Small detour", poor: "Big detour" };
const T_LABELS = ["Lost", "Perfect", "+0", "+1", "+2", "+3", "+4"];
/** A guess this far from every route country is named under the map rather than stretching it. */
const REACH_KM = 4000;

let ctx: CanvasRenderingContext2D | null = null;
const textWidth = (s: string) => {
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return s.length * 8;
  ctx.font = `13px ${getComputedStyle(document.body).fontFamily}`;
  return Math.ceil(ctx.measureText(s).width);
};

/** Every guess and route country resolved, the guesses in reach, and the player's chain; null to fall back to the chips. */
function travleGeo(geo: Geo, { guesses, optimalRoute }: RecordOf<"travle">["detail"]) {
  const all = new Map([...optimalRoute, ...guesses.map((g) => g.country)].map((code) => [code, geo.resolve(code)]));
  if (optimalRoute.length < 2 || [...all.values()].some((c) => !c)) return null;
  const at = (code: string) => all.get(code)!;
  const route = optimalRoute.map(at);
  const guessed = guesses.map((g) => ({ ...g, c: at(g.country), near: route.some((r) => geo.distanceKm(at(g.country), r) <= REACH_KM) }));
  const chain = playerRoute(optimalRoute, guesses.map((g) => g.country), (a, b) => geo.touches(at(a), at(b)));
  return {
    at,
    start: route[0]!,
    end: route.at(-1)!,
    guessed,
    frame: [...route, ...guessed.filter((g) => g.near).map((g) => g.c)],
    ...chain,
    sil: geo.silhouette(route.at(-1)!, 88),
    off: guessed.filter((g) => !g.near).map((g) => g.c.name),
  };
}
type View = NonNullable<ReturnType<typeof travleGeo>>;

/** Polylines through `pts`, split where a step is solid or borrowed (`gap`), so a missed stretch can be dashed. */
function lines(pts: [number, number][], gap: (i: number) => boolean) {
  const out = { solid: "", gap: "" };
  pts.slice(1).forEach((p, i) => {
    const key = gap(i) ? "gap" : "solid";
    const join = i > 0 && gap(i - 1) === gap(i);
    out[key] += `${join ? "" : `M${pts[i]!.map((n) => n.toFixed(1)).join(",")}`}L${p.map((n) => n.toFixed(1)).join(",")}`;
  });
  return out;
}

function TravleMap({ geo, view, w, h, active, onActive }: { geo: Geo; view: View; w: number; h: number; active: string | null; onActive: (code: string | null) => void }) {
  const drawn = useMemo(() => {
    const m = geo.mapView(w, h, view.frame);
    const pin = (c: Country) => m.pin(c) ?? ([-99, -99] as [number, number]);
    const pts = view.path.map((code) => pin(view.at(code)));
    const missing = new Set(view.missing);
    const ends = [view.start, view.end].map((c) => ({ c, at: pin(c), w: textWidth(c.name) + 2 }));
    const spots = geo.placeLabels(
      ends.map((e) => ({ key: e.c.name, at: e.at, w: e.w, h: 16 })),
      pts.map((p) => ({ x: p[0] - 5, y: p[1] - 5, w: 10, h: 10 })),
      w,
      h,
    );
    return { m, pin, pts, ends, spots, route: lines(pts, (i) => missing.has(view.path[i]!) || missing.has(view.path[i + 1]!)) };
  }, [geo, view, w, h]);
  const { m, pin, pts, ends, spots, route } = drawn;
  const near = view.guessed.filter((g) => g.near);
  const hot = near.find((g) => g.country === active);
  const tip = hot && `${hot.c.name}, ${WORDS[hot.rating].toLowerCase()}`;
  const tipAt = hot && pin(hot.c);
  const tipW = tip ? textWidth(tip) : 0;
  const over = (e: PointerEvent) => {
    const el = (e.target as Element).closest("[data-role=guess]");
    onActive(el?.getAttribute("data-country") ?? null);
  };
  return (
    <g onPointerOver={over} onPointerLeave={() => onActive(null)}>
      <g className="geo-land">{m.land().map((l) => <path key={l.key} d={l.d} />)}</g>
      <path data-country={view.path[0]} data-role="start" data-mark="start" d={m.shape(view.start)} />
      <path data-country={view.path.at(-1)} data-role="end" data-mark="end" d={m.shape(view.end)} />
      {near.map((g) => <path key={g.country} data-country={g.country} data-role="guess" data-rating={g.rating} data-mark="guess" style={{ fill: `var(--travle-${g.rating})` }} d={m.shape(g.c)} />)}
      {view.missing.map((code) => <path key={code} data-country={code} data-role="missing" data-mark="missing" d={m.shape(view.at(code))} />)}
      {near.map((g) => <path key={g.country} className="travle-outline" data-outline={g.country} data-on={g === hot ? "" : undefined} d={m.shape(g.c)} />)}
      <path className="travle-casing" d={"M" + pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join("L")} />
      <path data-route data-chain={view.path.join(" ")} data-mark="route" d={route.solid} />
      {route.gap && <path data-gap data-mark="gap" d={route.gap} />}
      {near.map((g) => {
        const [x, y] = pin(g.c);
        return <circle key={g.country} data-pin={g.country} data-mark="pin" cx={x} cy={y} r={3} />;
      })}
      {ends.map((e) => <circle key={e.c.name} data-pin={e.c.name} data-mark="pin" cx={e.at[0]} cy={e.at[1]} r={4.5} />)}
      {ends.map((e) => {
        const b = spots.get(e.c.name);
        return b && <text key={e.c.name} data-place x={b.x + 1} y={b.y + 12.5}>{e.c.name}</text>;
      })}
      {tip && tipAt && (
        <text data-hover-label x={Math.min(Math.max(tipAt[0] < w / 2 ? tipAt[0] + 10 : tipAt[0] - 10 - tipW, 4), w - tipW - 4)} y={Math.min(Math.max(tipAt[1] + 4, 16), h - 6)}>
          {tip}
        </text>
      )}
    </g>
  );
}

export function Travle({ record }: CardProps) {
  const { score, status, detail } = record as RecordOf<"travle">;
  const extra = detail.par === null ? null : score - detail.par;
  const value = status === "lost" ? `${detail.away ?? "Some"} away` : detail.perfect ? "Perfect" : extra === null ? plural(score, "guess", "guesses") : `+${extra}`;
  // Buckets pair up as `t * 2 + (hints ? 1 : 0)`; show the player's hint group, best first, lost last.
  const t = status === "lost" ? 0 : detail.perfect && extra === 0 ? 1 : extra === null ? null : Math.min(6, 2 + extra);
  const order = [1, 2, 3, 4, 5, 6, 0];
  const dist = detail.distribution;
  const geo = useGeo();
  const view = useMemo(() => (geo ? travleGeo(geo, detail) : null), [geo, detail]);
  const state = geoState(geo, view);
  const [active, setActive] = useState<string | null>(null);
  return (
    <Card game="travle" geo={state}>
      <Figure game="travle" value={value} label={<span className="meta">{[detail.par !== null && `Par ${detail.par}`, plural(score, "guess", "guesses"), detail.hints > 0 && plural(detail.hints, "hint")].filter(Boolean).join(", ")}</span>} />
      {state === "fallback" ? (
          <>
            <div className="chips" data-tiles role="img" aria-label="Guesses by rating">
              {detail.guesses.map((g, i) => (
                <i key={i} className="gtile chip" data-tile data-rating={g.rating} style={{ background: RATINGS[g.rating], color: inkOn(RATINGS[g.rating]) }}>
                  {g.country}
                </i>
              ))}
            </div>
            {detail.optimalRoute.length > 0 && <p className="meta">Shortest route {detail.optimalRoute.join(", ")}</p>}
          </>
      ) : (
        <>
          <AnswerRow d={view?.sil ?? null} name={view?.end.name ?? null}>
            {view && <p className="meta">From {view.start.name}</p>}
            {view && status === "lost" && view.missing.length > 0 && <p className="meta" data-missing>{`Missing ${view.missing.map((c) => view.at(c).name).join(", ")}`}</p>}
            {view && view.off.length > 0 && <p className="meta" data-offmap>{`Off the map: ${view.off.join(", ")}`}</p>}
          </AnswerRow>
          <MapBox ready={!!view} label={view ? `Route from ${view.start.name} to ${view.end.name} through ${view.path.slice(1, -1).map((c) => view.at(c).name).join(", ")}` : ""}>
            {(w, h) => <TravleMap geo={geo as Geo} view={view!} w={w} h={h} active={active} onActive={setActive} />}
          </MapBox>
        </>
      )}
      {state !== "fallback" && (
        <Side>
          <ul className="travle-legend" data-legend aria-label="Guesses in the order played">
            {detail.guesses.map((g) => (
              <li
                key={g.country}
                data-row={g.country}
                data-active={active === g.country ? "" : undefined}
                tabIndex={0}
                onFocus={() => setActive(g.country)}
                onBlur={() => setActive(null)}
                onPointerEnter={() => setActive(g.country)}
                onPointerLeave={() => setActive(null)}
              >
                <i data-swatch style={{ background: `var(--travle-${g.rating})` }} />
                {view ? <span data-name>{view.at(g.country).name}</span> : <i className="geo-hold" data-geo-placeholder />}
                <span className="meta">{WORDS[g.rating]}</span>
              </li>
            ))}
          </ul>
        </Side>
      )}
      {detail.topPercent !== null && <Caption>{`Top ${detail.topPercent}% today`}</Caption>}
      {dist && t !== null && (
        <Bars
          label="Today's results"
          bars={order.map((ti) => ({ label: T_LABELS[ti]!, value: dist[ti * 2 + (detail.hints ? 1 : 0)] ?? 0 }))}
          own={order.indexOf(t)}
          ownColor="#7daea3"
          readout={(b) => `${b.label}: ${fmt(b.value)} players`}
        />
      )}
    </Card>
  );
}
