/// <reference types="chrome" />
import { GAMES } from "./games";

const LOCAL = ["http://localhost:5173", "http://127.0.0.1:5173"];

/** Bare dashboard origins; loopback is available only in explicit dev builds, with a port. */
export function dashboardMatches(env = "", dev = false): string[] {
  const origins = env.split(",").map((s) => s.trim()).filter(Boolean);
  if (!dev && !origins.length) throw new Error("DAILIES_DASHBOARD_ORIGINS is required for production builds");
  const configured = origins.map((origin) => {
    const m = origin.match(/^(https?:\/\/([a-z0-9.-]+|\[::1\])(?::(\d+))?)\/?$/i);
    if (!m) throw new Error(`DAILIES_DASHBOARD_ORIGINS: "${origin}" is not a bare http(s) origin`);
    const url = new URL(origin);
    const local = /localhost|^127\.|\[::1\]/i.test(url.hostname);
    if (local && (!dev || !m[3])) throw new Error("DAILIES_DASHBOARD_ORIGINS: loopback requires DAILIES_DEV=1 and an explicit port");
    return local ? `${url.protocol}//${url.hostname}:${m[3]}` : url.origin;
  });
  return [...new Set([...configured, ...(dev ? LOCAL : [])])].map((origin) => `${origin}/*`);
}

export function buildManifest({ version, dashboardOrigins, dev = false }: { version: string; dashboardOrigins?: string; dev?: boolean }): chrome.runtime.ManifestV3 {
  const games = GAMES.flatMap((g) => g.matches);
  const dashboards = dashboardMatches(dashboardOrigins, dev);
  return {
    manifest_version: 3,
    name: "Dailies",
    version,
    description: "Logs your daily web game results as you finish them. Results stay in your browser.",
    permissions: ["storage", "scripting"],
    host_permissions: [...games, ...dashboards],
    background: { service_worker: "background.js", type: "module" as const },
    action: { default_title: "Dailies", default_popup: "popup.html", default_icon: ICONS },
    icons: ICONS,
    content_scripts: [
      { matches: games, js: ["hook.js"], run_at: "document_start" as const, world: "MAIN" as const },
      { matches: games, js: ["content.js"], run_at: "document_start" as const },
      { matches: dashboards, js: ["bridge.js"], run_at: "document_idle" as const },
    ],
  };
}

const ICONS = { "16": "icons/16.png", "32": "icons/32.png", "48": "icons/48.png", "128": "icons/128.png" };
