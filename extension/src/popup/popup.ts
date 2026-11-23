/// <reference types="chrome" />
import { GAMES } from "../games";
import { loadState, showBadge, todayRows, type Row } from "../store";

const list = document.getElementById("games")!;
const failed = document.getElementById("failed")!;
const note = document.getElementById("note")!;
const fade = matchMedia("(prefers-reduced-motion: reduce)").matches ? 150 : 200;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: Node[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...kids);
  return node;
}

const STATUS: Record<Row["status"], (r: Row) => string> = {
  logged: (r) => (r.at ? `Logged ${time(r.at)}` : "Logged"),
  missed: () => "Played, not logged",
  none: () => "Not played yet",
};

let shown = new Map<string, Row["status"]>();

function row(r: Row | { game: Row["game"]; status?: undefined }) {
  const link = el("a", { href: r.game.url, target: "_blank", rel: "noopener noreferrer", textContent: r.game.name });
  const status = r.status
    ? el("span", { className: `status ${r.status}`, textContent: STATUS[r.status](r as Row) })
    : el("span", { className: "status pending" });
  const li = el("li", {}, link, status);
  if (r.status === "missed") {
    const reason = el("p", { className: "reason", textContent: r.reason ?? "" });
    const button = el("button", { type: "button", className: "secondary", textContent: "Retry" });
    button.addEventListener("click", () => void retry(r as Row, button, reason));
    li.append(reason, button);
  }
  // A row whose status just changed fades in; unchanged rows stay still.
  if (r.status && shown.size && shown.get(r.game.id) !== r.status) status.animate({ opacity: [0, 1] }, { duration: fade, easing: "cubic-bezier(.23, 1, .32, 1)" });
  return li;
}

/** Retry: ask the open game tab to re-read once. With no tab open, open the game, whose load read retries. */
async function retry(r: Row, button: HTMLButtonElement, reason: HTMLElement) {
  button.disabled = true;
  button.textContent = "Checking…";
  const tabs = await chrome.tabs.query({ url: r.game.matches });
  if (!tabs.length) {
    await chrome.tabs.create({ url: r.game.url });
    return;
  }
  for (const tab of tabs) {
    const res = (await chrome.tabs.sendMessage(tab.id!, { type: "retry", game: r.game.id }).catch(() => undefined)) as { ok?: boolean } | undefined;
    if (res?.ok) return; // storage changes and the list re-renders as logged
  }
  reason.textContent = "Still not found on the open page. Show its result screen, then retry.";
  button.disabled = false;
  button.textContent = "Retry";
}

async function render() {
  try {
    const state = await loadState();
    const rows = todayRows(state, new Date());
    failed.hidden = true;
    list.hidden = false;
    list.removeAttribute("aria-busy");
    list.replaceChildren(...rows.map(row));
    shown = new Map(rows.map((r) => [r.game.id, r.status]));
    note.textContent = rows.some((r) => r.status !== "none")
      ? "Saved in this browser only."
      : "Finish a game on its site and it is logged here.";
    void showBadge(state);
  } catch {
    list.hidden = true;
    note.textContent = "";
    failed.hidden = false;
  }
}

document.getElementById("date")!.textContent = new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
document.getElementById("reload")!.addEventListener("click", () => void render());
// First paint: the real names with a quiet placeholder where each status goes, never a guessed status.
list.replaceChildren(...GAMES.map((game) => row({ game })));
chrome.storage.onChanged.addListener((_c, area) => area === "local" && void render());
void render();
