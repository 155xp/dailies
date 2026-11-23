/**
 * The lazy geo chunk: world-atlas countries-110m (Natural Earth), topojson-client and d3-geo.
 * Only `geo-view.tsx` imports it, through a dynamic import, so it loads when a Travle or Globle card renders.
 */
import { geoArea, geoAzimuthalEqualArea, geoCentroid, geoDistance, geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { feature } from "topojson-client";
import atlas from "world-atlas/countries-110m.json";

type Shape = Feature<Polygon | MultiPolygon, { name: string }>;
export interface Country {
  name: string;
  feature: Shape;
  /** The main landmass and what lies near it, so far islands (French Guiana, Alaska) don't pull the fit. */
  body: Shape;
  center: [number, number];
}

type Atlas = Parameters<typeof feature>[0];
const topo = atlas as unknown as Atlas;
const SHAPES = (feature(topo, topo.objects.countries!) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>).features;

/** ISO 3166 alpha-3 (Travle) to the atlas's numeric ids. */
const ISO = "FJI242 TZA834 ESH732 CAN124 USA840 KAZ398 UZB860 PNG598 IDN360 ARG032 CHL152 COD180 SOM706 KEN404 SDN729 TCD148 HTI332 DOM214 RUS643 BHS044 FLK238 NOR578 GRL304 ATF260 TLS626 ZAF710 LSO426 MEX484 URY858 BRA076 BOL068 PER604 COL170 PAN591 CRI188 NIC558 HND340 SLV222 GTM320 BLZ084 VEN862 GUY328 SUR740 FRA250 ECU218 PRI630 JAM388 CUB192 ZWE716 BWA072 NAM516 SEN686 MLI466 MRT478 BEN204 NER562 NGA566 CMR120 TGO768 GHA288 CIV384 GIN324 GNB624 LBR430 SLE694 BFA854 CAF140 COG178 GAB266 GNQ226 ZMB894 MWI454 MOZ508 SWZ748 AGO024 BDI108 ISR376 LBN422 MDG450 PSE275 GMB270 TUN788 DZA012 JOR400 ARE784 QAT634 KWT414 IRQ368 OMN512 VUT548 KHM116 THA764 LAO418 MMR104 VNM704 PRK408 KOR410 MNG496 IND356 BGD050 BTN064 NPL524 PAK586 AFG004 TJK762 KGZ417 TKM795 IRN364 SYR760 ARM051 SWE752 BLR112 UKR804 POL616 AUT040 HUN348 MDA498 ROU642 LTU440 LVA428 EST233 DEU276 BGR100 GRC300 TUR792 ALB008 HRV191 CHE756 LUX442 BEL056 NLD528 PRT620 ESP724 IRL372 NCL540 SLB090 NZL554 AUS036 LKA144 CHN156 TWN158 ITA380 DNK208 GBR826 ISL352 AZE031 GEO268 PHL608 MYS458 BRN096 SVN705 FIN246 SVK703 CZE203 ERI232 JPN392 PRY600 YEM887 SAU682 ATA010 CYP196 MAR504 EGY818 LBY434 ETH231 DJI262 UGA800 RWA646 BIH070 MKD807 SRB688 MNE499 TTO780 SSD728";

/** The games' spellings that differ from the atlas's short names. */
const ALIASES: Record<string, string> = {
  "united states": "United States of America", usa: "United States of America", us: "United States of America", turkiye: "Turkey",
  "czech republic": "Czechia", "democratic republic of the congo": "Dem. Rep. Congo", "dr congo": "Dem. Rep. Congo",
  "republic of the congo": "Congo", "central african republic": "Central African Rep.", "dominican republic": "Dominican Rep.",
  "bosnia and herzegovina": "Bosnia and Herz.", "equatorial guinea": "Eq. Guinea", "south sudan": "S. Sudan", "ivory coast": "Côte d'Ivoire",
  swaziland: "eSwatini", "north macedonia": "Macedonia", "solomon islands": "Solomon Is.", "falkland islands": "Falkland Is.",
  "western sahara": "W. Sahara", "east timor": "Timor-Leste", burma: "Myanmar", uk: "United Kingdom", "great britain": "United Kingdom",
  "russian federation": "Russia", "viet nam": "Vietnam", "northern cyprus": "N. Cyprus", "state of palestine": "Palestine", xkx: "Kosovo",
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim().replace(/^the /, "");

const byKey = new Map<string, Shape>();
for (const f of SHAPES) byKey.set(norm(f.properties.name), f);
for (const [alias, name] of Object.entries(ALIASES)) byKey.set(alias, byKey.get(norm(name))!);
for (const m of ISO.matchAll(/([A-Z]{3})(\d{3})/g)) {
  const f = SHAPES.find((s) => s.id === m[2]);
  if (f) byKey.set(m[1]!.toLowerCase(), f);
}

function bodyOf(f: Shape): Shape {
  if (f.geometry.type === "Polygon") return f;
  const parts = f.geometry.coordinates.map((coordinates) => ({ type: "Polygon" as const, coordinates }));
  const main = geoCentroid(parts.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a)));
  const near = parts.filter((p) => geoDistance(geoCentroid(p), main) < 0.6).map((p) => p.coordinates);
  return { ...f, geometry: { type: "MultiPolygon", coordinates: near } };
}

const cache = new Map<string, Country | null>();
/** A game's country name or ISO code to its atlas shape; null when unknown. */
export function resolve(name: string): Country | null {
  const key = norm(String(name));
  if (!cache.has(key)) {
    const f = byKey.get(key);
    const body = f && bodyOf(f);
    cache.set(key, f && body ? { name: f.properties.name, feature: f, body, center: geoCentroid(body) } : null);
  }
  return cache.get(key)!;
}

export const distanceKm = (a: Country, b: Country) => geoDistance(a.center, b.center) * 6371;
export const roundKm = (km: number) => Math.round(km / 100) * 100;
export const aboutKm = (km: number) => (km < 100 ? "under 100 km" : `about ${roundKm(km).toLocaleString("en-US")} km`);

/** A country's outline, true to shape (equal-area, centered on it), fitted to a square. */
export function silhouette(c: Country, size: number) {
  const p = geoAzimuthalEqualArea().rotate([-c.center[0], -c.center[1]]).fitExtent([[1, 1], [size - 1, size - 1]], c.body);
  return geoPath(p)(c.body) ?? "";
}

export type Box = { x: number; y: number; w: number; h: number };

/**
 * A map of the world at w by h, fitted to `fit` and centered on `lon`. Padding and edges scale with the width,
 * so which pins land in the frame is the same at every size.
 */
export function mapView(w: number, h: number, fit: Country[], lon?: number) {
  const [pad, edge] = [w * 0.04, w * 0.02];
  const all: FeatureCollection = { type: "FeatureCollection", features: fit.map((c) => c.body) };
  const proj = geoNaturalEarth1()
    .rotate([-(lon ?? geoCentroid(all)[0]), 0])
    .fitExtent([[pad, pad], [w - pad, h - pad]], all)
    .clipExtent([[0, 0], [w, h]]);
  const path = geoPath(proj);
  const ok = (q: [number, number] | null | undefined): q is [number, number] => !!q && q[0] >= edge && q[0] <= w - edge && q[1] >= edge && q[1] <= h - edge;
  return {
    land: () => SHAPES.flatMap((f, i) => {
      const d = path(f);
      return d ? [{ key: String(f.id ?? i), d }] : [];
    }),
    shape: (c: Country) => path(c.feature) ?? "",
    /** The country's center in the frame, else the center of the part that shows, else null (off the map). */
    pin: (c: Country) => {
      const p = proj(c.center);
      if (ok(p)) return p;
      const q = path.centroid(c.feature);
      return ok(q) ? q : null;
    },
  };
}

const hit = (a: Box, b: Box, m = 2) => a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

/** Place each label at the free spot nearest its anchor, inside the frame, clear of the other labels and of `avoid`. */
export function placeLabels(items: { key: string; at: [number, number]; w: number; h: number }[], avoid: Box[], W: number, H: number) {
  const placed: Box[] = [];
  const out = new Map<string, Box>();
  for (const { key, at, w, h } of items) {
    let best: Box | null = null;
    let score = Infinity;
    for (let y = 2; y <= H - h - 2; y += 3)
      for (let x = 2; x <= W - w - 2; x += 3) {
        const b = { x, y, w, h };
        const dx = Math.max(x - at[0], 0, at[0] - x - w);
        const dy = Math.max(y - at[1], 0, at[1] - y - h);
        const s = Math.hypot(dx, dy) + (x < at[0] ? 2 : 0);
        if (s < score && !placed.some((p) => hit(p, b)) && !avoid.some((p) => hit(p, b, 1))) [best, score] = [b, s];
      }
    if (best) {
      placed.push(best);
      out.set(key, best);
    }
  }
  return out;
}
