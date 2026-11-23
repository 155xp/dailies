import { useEffect, useRef, useState } from "react";

const ADDRESS = "chrome://extensions";
const COPY = { idle: "Copy address", copied: "Copied", failed: "Copy failed" } as const;

/** A small capture of Chrome's own UI for one step, matching the system theme. */
function Shot({ name, alt }: { name: string; alt: string }) {
  return (
    <picture className="shot">
      <source media="(prefers-color-scheme: dark)" srcSet={`install/${name}-dark.png`} />
      <img src={`install/${name}-light.png`} width={280} height={64} alt={alt} />
    </picture>
  );
}

/**
 * Shown above today's list while the extension is not found. Four plain steps; the page swaps them for
 * today's rows as soon as the extension's content script posts its state, with no reload.
 */
export function Install({ check, checking, leaving }: { check: () => void; checking: boolean; leaving: boolean }) {
  const [copy, setCopy] = useState<keyof typeof COPY>("idle");
  const revert = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(revert.current), []);

  const copyAddress = () => {
    const settle = (next: keyof typeof COPY) => {
      setCopy(next);
      window.clearTimeout(revert.current);
      revert.current = window.setTimeout(() => setCopy("idle"), 2000);
    };
    // Says Copied on the click, before the clipboard answers; corrects itself if the copy is refused.
    settle("copied");
    (navigator.clipboard ? navigator.clipboard.writeText(ADDRESS) : Promise.reject(new Error("no clipboard"))).then(
      () => settle("copied"),
      () => settle("failed"),
    );
  };

  return (
    <section className="notice install enter" data-panel data-leaving={leaving || undefined} aria-labelledby="install-title">
      <h2 className="section-title" id="install-title">
        Install the extension
      </h2>
      <p className="quiet">Dailies reads your results with a small extension for Chrome and the browsers built on it, such as Edge, Brave and Helium.</p>
      <ol className="steps">
        <li className="step">
          <p>Download the extension and unzip it into a folder you'll keep, such as Documents. Chrome loads the extension from that folder, so deleting it removes the extension.</p>
          <a className="primary" href={__EXTENSION_URL__} download>
            Download the extension
          </a>
          <Shot name="download" alt="Chrome's download list with dailies-extension.zip" />
        </li>
        <li className="step">
          <p>
            Open <span className="address">{ADDRESS}</span> in a new tab and turn on Developer mode at the top right.
          </p>
          <div className="act">
            <button type="button" className="secondary" onClick={copyAddress} aria-live="polite">
              {COPY[copy]}
            </button>
            <p className="meta">Chrome won't open this address from a link, so paste it into a new tab's address bar.</p>
          </div>
          <Shot name="devmode" alt="The Developer mode switch, turned on, in Chrome's extensions page" />
        </li>
        <li className="step">
          <p>Choose Load unpacked and pick that folder. This page finds the extension on its own.</p>
          <button type="button" className="secondary" onClick={check} disabled={checking}>
            {checking ? "Checking…" : "Check again"}
          </button>
          <Shot name="unpacked" alt="The Load unpacked button in Chrome's extensions page" />
        </li>
        <li className="step">
          <p>Click the puzzle piece in the toolbar and pin Dailies, so you can open it any time.</p>
        </li>
      </ol>
    </section>
  );
}
