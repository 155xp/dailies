/// <reference types="chrome" />
import { GAMES } from "./games";

const LOCAL = ["http://localhost/*", "http://127.0.0.1/*"];

/** `DAILIES_DASHBOARD_ORIGINS` is a comma-separated list of bare origins, such as `https://dash.example`. */
export function dashboardMatches(env = ""): string[] {
  const extra = env
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((origin) => {
      const m = origin.match(/^(https?:\/\/[a-z0-9.-]+(?::\d+)?)\/?$/i);
      if (!m) throw new Error(`DAILIES_DASHBOARD_ORIGINS: "${origin}" is not a bare http(s) origin`);
      return `${m[1]}/*`;
    });
  return [...LOCAL, ...extra];
}

export function buildManifest({ version, dashboardOrigins }: { version: string; dashboardOrigins?: string }): chrome.runtime.ManifestV3 {
  const games = GAMES.flatMap((g) => g.matches);
  const dashboards = dashboardMatches(dashboardOrigins);
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
