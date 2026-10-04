/** Dev-only tuner for the shared card currents.
 *
 * AmbientFlow loads this under `astro dev` only; it opens with ?motion in the
 * URL and stays for the tab. It edits the live desktop and compact values in
 * shared-currents, replays the entrance, and outlines which surfaces carry
 * moving currents and which keep still geometry. "copy" puts the values on
 * the clipboard so they can go back into shared-currents.
 */
import { currentTuning, replaySharedCurrents } from "./shared-currents";

type Tier = keyof typeof currentTuning;
type Field = keyof (typeof currentTuning)["desktop"];
const FIELDS: [Field, string, number, number, number][] = [
  ["speed", "swell clock", 0, 5, 0.1],
  ["amount", "swell px", 0, 60, 1],
  ["shear", "layer slide", 0, 3, 0.05],
  ["breathe", "breathe px", 0, 60, 1],
  ["push", "scroll push px/px", 0, 0.5, 0.01],
  ["pour", "pour ms", 300, 2400, 50],
  ["bandDelay", "band stagger ms", 0, 400, 10],
  ["cardDelay", "card stagger ms", 0, 300, 10],
  ["activeFps", "scroll fps", 30, 60, 30],
  ["page", "page bands × swell", 0, 2, 0.05],
];
const STORE = "current-tuner";
const defaults = structuredClone(currentTuning);
const compact = matchMedia("(max-width: 1023px)");
const tier = (): Tier => (compact.matches ? "compact" : "desktop");

type Saved = {
  values?: typeof currentTuning;
  surfaces?: boolean;
  folded?: boolean;
};
function read(): Saved | null {
  try {
    const raw = sessionStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
let saved: Saved = {};
function save() {
  try {
    sessionStorage.setItem(
      STORE,
      JSON.stringify({ ...saved, values: currentTuning }),
    );
  } catch {}
}

// Surfaces that carry the moving currents, and the still geometry around them.
const MOVING: [string, string][] = [
  [".page-current", "page bands: tide drift"],
  [".press-mention", "press feature"],
  [".experience-feature", "featured work"],
  [".work-card", "work card"],
  [".writing-card", "writing card"],
  [".coding-agent-card", "guide card"],
];
const STILL: [string, string][] = [
  [".detail-waves", "article header waves: still, morph on open"],
];

let panel: HTMLElement | undefined;
let layer: HTMLElement | undefined;
function outline() {
  layer?.remove();
  layer = undefined;
  if (!saved.surfaces) return;
  layer = document.createElement("div");
  layer.className = "current-tuner-surfaces";
  const mark = (el: Element, label: string, still: boolean) => {
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const tag = document.createElement("div");
    tag.dataset.still = String(still);
    tag.style.cssText = `left:${box.left + scrollX}px;top:${box.top + scrollY}px;width:${box.width}px;height:${box.height}px`;
    tag.innerHTML = `<span></span>`;
    tag.firstElementChild!.textContent = label;
    layer!.appendChild(tag);
  };
  for (const [selector, label] of MOVING)
    document
      .querySelectorAll(
        selector === ".page-current"
          ? selector
          : `${selector}:has(> [data-shared-current])`,
      )
      .forEach((el) =>
        mark(
          el,
          selector === ".page-current"
            ? label
            : `${label}: pours, swells, pushed`,
          false,
        ),
      );
  for (const [selector, label] of STILL)
    document.querySelectorAll(selector).forEach((el) => mark(el, label, true));
  document.body.appendChild(layer);
}

function render() {
  if (!panel) {
    panel = document.createElement("aside");
    panel.className = "current-tuner";
    panel.setAttribute("aria-label", "current tuner");
    panel.innerHTML = `<style>
      .current-tuner{position:fixed;left:12px;bottom:12px;z-index:2147483000;width:min(320px,calc(100vw - 24px));max-height:calc(100svh - 24px);overflow:auto;padding:10px;border-radius:14px;background:rgb(10 22 38/.92);color:#eaf2fd;font:500 12px/1.35 ui-sans-serif,system-ui,-apple-system,sans-serif;box-shadow:0 8px 30px rgb(0 0 0/.25)}
      .current-tuner button{all:unset;cursor:pointer;padding:5px 9px;border-radius:999px;background:rgb(255 255 255/.08)}
      .current-tuner button:hover{background:rgb(255 255 255/.16)}
      .current-tuner button[aria-pressed=true]{background:#61abea;color:#0a1626}
      .current-tuner button:focus-visible,.current-tuner input:focus-visible{outline:2px solid #61abea;outline-offset:2px}
      .current-tuner [data-row]{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
      .current-tuner [data-tier]{margin-right:auto;color:#b8c5d8}
      .current-tuner label{display:grid;grid-template-columns:1fr auto;gap:2px 8px;margin-top:8px;color:#b8c5d8}
      .current-tuner output{color:#eaf2fd;font-variant-numeric:tabular-nums}
      .current-tuner input{grid-column:1/-1;width:100%;accent-color:#61abea}
      .current-tuner[data-folded=true] label{display:none}
      .current-tuner-surfaces{position:absolute;inset:0 auto auto 0;z-index:2147482999;pointer-events:none}
      .current-tuner-surfaces div{position:absolute;box-sizing:border-box;border:2px dashed #ff3d9a;border-radius:16px}
      .current-tuner-surfaces div[data-still=true]{border-color:#2fd3b5;border-radius:0}
      .current-tuner-surfaces span{position:absolute;left:6px;top:6px;padding:2px 6px;border-radius:6px;background:#ff3d9a;color:#fff;font:600 11px/1.3 ui-sans-serif,system-ui,sans-serif}
      .current-tuner-surfaces div[data-still=true] span{background:#2fd3b5;color:#06231d}
    </style><div data-row><span data-tier></span></div><div data-fields></div>`;
    const row = panel.querySelector("[data-row]")!;
    const button = (text: string, act: () => void, pressed?: () => boolean) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.addEventListener("click", () => {
        act();
        if (pressed) b.setAttribute("aria-pressed", String(pressed()));
      });
      if (pressed) b.setAttribute("aria-pressed", String(pressed()));
      row.appendChild(b);
    };
    button("replay", replaySharedCurrents);
    button(
      "surfaces",
      () => {
        saved.surfaces = !saved.surfaces;
        save();
        outline();
      },
      () => Boolean(saved.surfaces),
    );
    button("copy", () => {
      void navigator.clipboard?.writeText(
        JSON.stringify(currentTuning, null, 2),
      );
    });
    button("reset", () => {
      Object.assign(currentTuning[tier()], defaults[tier()]);
      save();
      render();
    });
    button(
      "fold",
      () => {
        saved.folded = !saved.folded;
        save();
        render();
      },
      () => Boolean(saved.folded),
    );
    const fields = panel.querySelector("[data-fields]")!;
    for (const [key, name, min, max, step] of FIELDS) {
      const label = document.createElement("label");
      label.innerHTML = `<span></span><output></output><input type="range">`;
      label.querySelector("span")!.textContent = name;
      const input = label.querySelector("input")!;
      Object.assign(input, { min, max, step });
      input.dataset.field = key;
      input.addEventListener("input", () => {
        currentTuning[tier()][key] = Number(input.value);
        label.querySelector("output")!.textContent = input.value;
        save();
      });
      fields.appendChild(label);
    }
  }
  if (!panel.isConnected) document.body.appendChild(panel);
  panel.dataset.folded = String(Boolean(saved.folded));
  panel.querySelector("[data-tier]")!.textContent =
    tier() === "compact" ? "compact, under 1024px" : "desktop, 1024px and up";
  panel
    .querySelectorAll<HTMLInputElement>("input[data-field]")
    .forEach((input) => {
      const value = currentTuning[tier()][input.dataset.field as Field];
      input.value = String(value);
      input.parentElement!.querySelector("output")!.textContent = String(value);
    });
}

export function installTuner() {
  const param = new URLSearchParams(location.search).get("motion");
  if (param === "off") {
    try {
      sessionStorage.removeItem(STORE);
    } catch {}
    return;
  }
  const stored = read();
  if (!stored && param === null) return;
  saved = stored ?? {};
  if (saved.values) {
    Object.assign(currentTuning.desktop, saved.values.desktop);
    Object.assign(currentTuning.compact, saved.values.compact);
  }
  save();
  render();
  outline();
  compact.addEventListener("change", render);
  window.addEventListener("resize", outline);
  document.addEventListener("astro:page-load", () => {
    render();
    // Measure once the page's own entrance has placed the cards.
    setTimeout(outline, 1000);
  });
  setTimeout(outline, 1000);
}
