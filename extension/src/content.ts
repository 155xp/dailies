/// <reference types="chrome" />
import { gameForUrl } from "./games";
import { startCapture, type ContentMessage } from "./page";

/** Isolated world on the 10 game pages: capture, and answer the popup's Retry. */
const game = gameForUrl(location.href);
if (game) {
  const send = (m: ContentMessage) => {
    try {
      chrome.runtime.sendMessage(m).catch(() => {});
    } catch {
      // The extension was reloaded or removed; this page's script is orphaned.
    }
  };
  const capture = startCapture({ game, win: window, send });
  chrome.runtime.onMessage.addListener((msg: { type?: string; game?: string }, _sender, reply) => {
    if (msg?.type !== "retry" || msg.game !== game.id) return undefined;
    void capture.retry().then((ok) => reply({ ok }));
    return true;
  });
}
