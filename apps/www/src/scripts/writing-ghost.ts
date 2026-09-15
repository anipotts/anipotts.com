/** Captures for the writing card choreography: a still copy of the
 * outgoing page that the motion can fade, and the wave artwork and text of
 * both pages as plain data.
 *
 * The copy lives in a shadow root that adopts the outgoing document's
 * stylesheets as constructable sheets, rebuilt at idle with root selectors
 * rewritten to the host, so the incoming document's styles cannot restyle it
 * and its styles cannot leak into the incoming page. Engines without
 * adoptedStyleSheets get a light-DOM copy that carries the outgoing sheets
 * the swap is about to drop.
 */

import * as wave from "../lib/wave-geometry";
import * as timeline from "../lib/writing-timeline";

const built = new Map<string, CSSStyleSheet>();
const SHEET_LIMIT = 24;
const supported =
  typeof ShadowRoot !== "undefined" &&
  "adoptedStyleSheets" in ShadowRoot.prototype &&
  typeof CSSStyleSheet !== "undefined" &&
  "replaceSync" in CSSStyleSheet.prototype;
const rootSelector =
  /(^|[\s,{}>+~)])(?:html|body|:root)((?:\[[^\]]*\]|:not\([^)]*\)|\.[\w-]+)*)(?=[\s,{>+~.:[]|$)/g;

/** Root and body selectors rewritten for a shadow host, which stands in
 * for both. */
export function hostScoped(css: string) {
  return css.replace(rootSelector, (_, lead: string, rest: string) =>
    rest ? `${lead}:host(${rest})` : `${lead}:host`,
  );
}

function sheetKey(sheet: CSSStyleSheet) {
  const node = sheet.ownerNode;
  if (node instanceof HTMLLinkElement) return node.href;
  if (node instanceof HTMLStyleElement) return node.textContent || "";
  return "";
}

function documentSheets(build: boolean) {
  const sheets: CSSStyleSheet[] = [];
  for (const sheet of document.styleSheets) {
    const key = sheetKey(sheet);
    if (!key || sheet.disabled) continue;
    let copy = built.get(key);
    if (!copy && build) {
      try {
        const node = sheet.ownerNode;
        const text =
          node instanceof HTMLStyleElement
            ? node.textContent || ""
            : [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
        copy = new CSSStyleSheet();
        copy.replaceSync(hostScoped(text));
        built.set(key, copy);
        if (built.size > SHEET_LIMIT) built.delete(built.keys().next().value!);
      } catch {
        // Cross-origin font sheets and @import rules stay with the document.
        continue;
      }
    }
    if (copy) sheets.push(copy);
  }
  return sheets;
}

/** Builds constructable copies of the current document's sheets. */
export function prepareGhostSheets() {
  if (supported) documentSheets(true);
}

/** Resolves style once against the copied sheets, and runs the animation
 * and morph code paths, so the first swap indexes no rules and compiles no
 * functions. */
function warmStyles() {
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:1px;height:1px;contain:strict;visibility:hidden;pointer-events:none;";
  const scope = supported ? probe.attachShadow({ mode: "open" }) : probe;
  const child = scope.appendChild(document.createElement("div"));
  document.documentElement.appendChild(probe);
  if (supported)
    (scope as ShadowRoot).adoptedStyleSheets = documentSheets(false);
  void getComputedStyle(child).color;
  if ("animate" in child)
    child
      .animate(
        [
          {
            opacity: 0,
            transform: timeline.IDENTITY,
            clipPath: timeline.FULL_CLIP,
          },
          {
            opacity: 1,
            transform: timeline.placement(1, 1, 1.5),
            clipPath: timeline.insetClip(
              { left: 1, top: 1, right: 2, bottom: 2 },
              3,
              3,
              "1px",
            ),
          },
        ],
        { duration: 1, easing: timeline.OPEN_EASE, fill: "both" },
      )
      .cancel();
  probe.remove();
}

export interface Ghost {
  /** Outer frame: the element to remove, and the one a clip animates. */
  host: HTMLElement;
  /** The copy itself, the element an opacity animation fades. A clip and
   * an opacity animation on one element keep the clip off the compositor. */
  layer: HTMLElement;
  /** Keeps parts of the copied page out of view. */
  hide(selectors: string[]): void;
  /** Reveals the copy over the incoming page at the given stacking level. */
  show(ground: string | null, zIndex: number): void;
}

const trimmed = ".article-body > *, .article-end, .list > *";

/** Copies the outgoing page while it is still in the document. The copy is
 * removed by removing `host`. */
export function captureGhost(main: HTMLElement, hidden: string[]): Ghost {
  const root = document.documentElement;
  const frame = document.createElement("div");
  frame.className = "writing-transition-ghost";
  frame.setAttribute("aria-hidden", "true");
  frame.inert = true;
  frame.style.cssText =
    "position:fixed;inset:0;margin:0;z-index:100;pointer-events:none;overflow:hidden;contain:strict;will-change:clip-path;";
  const host = frame.appendChild(document.createElement("div"));
  for (const { name, value } of root.attributes)
    if (name !== "style" && name !== "id") host.setAttribute(name, value);
  host.style.cssText =
    "position:absolute;inset:0;margin:0;overflow:hidden;will-change:opacity;background:transparent;";
  const copy = (source: HTMLElement, height: boolean) => {
    const box = source.getBoundingClientRect();
    const el = source.cloneNode(true) as HTMLElement;
    el.style.cssText = `position:absolute;left:${box.left}px;top:${box.top}px;width:${box.width}px;margin:0;${height ? `height:${box.height}px;` : ""}`;
    return el;
  };
  const parts: HTMLElement[] = [];
  const current = document.querySelector<HTMLElement>("body > .page-current");
  if (current) parts.push(copy(current, true));
  // Blocks entirely below the fold are never seen; leave them out.
  const live = [...main.querySelectorAll<HTMLElement>(trimmed)];
  const below = live.map((el) => el.getBoundingClientRect().top > innerHeight);
  const clone = copy(main, false);
  const copies = [...clone.querySelectorAll<HTMLElement>(trimmed)];
  if (copies.length === live.length)
    copies.forEach((el, i) => below[i] && el.remove());
  clone.inert = true;
  clone.querySelectorAll("script").forEach((el) => el.remove());
  // Icons reference shared symbols by id; keep the ids the copy uses.
  const used = new Set(
    [...clone.querySelectorAll("use")].map((el) =>
      (el.getAttribute("href") || "").slice(1),
    ),
  );
  clone
    .querySelectorAll("[id]")
    .forEach((el) => used.has(el.id) || el.removeAttribute("id"));
  const symbols = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  symbols.style.display = "none";
  for (const id of used)
    if (!clone.querySelector(`[id="${CSS.escape(id)}"]`)) {
      const symbol = document.getElementById(id);
      if (symbol) symbols.appendChild(symbol.cloneNode(true));
    }
  clone.appendChild(symbols);
  clone
    .querySelectorAll("[data-rise]")
    .forEach((el) => el.removeAttribute("data-rise"));
  parts.push(clone);
  const sheets = supported ? documentSheets(true) : [];
  const outgoingSheets = sheets.length
    ? []
    : [...document.head.querySelectorAll("style, link[rel=stylesheet][href]")];
  const target = sheets.length ? host.attachShadow({ mode: "open" }) : host;
  for (const el of outgoingSheets) target.appendChild(el.cloneNode(true));
  // Rules scoped by a root class or attribute without naming the root
  // (".editorial-detail .article-body") need an ancestor inside the copy.
  const scope = target.appendChild(document.createElement("div"));
  for (const { name, value } of root.attributes)
    if (name !== "style" && name !== "id") scope.setAttribute(name, value);
  scope.style.display = "contents";
  for (const el of parts) scope.appendChild(el);
  const ghost: Ghost = {
    host: frame,
    layer: host,
    hide(selectors) {
      if (selectors.length)
        clone
          .querySelectorAll<HTMLElement>(selectors.join(","))
          .forEach((el) => el.style.setProperty("visibility", "hidden"));
    },
    show(ground, zIndex) {
      host.querySelectorAll(":scope > style").forEach((el) => {
        const same = [...document.head.querySelectorAll("style")].some(
          (kept) => kept.textContent === el.textContent,
        );
        if (same) el.remove();
      });
      host.querySelectorAll(":scope > link").forEach((el) => {
        const href = el.getAttribute("href");
        if (document.head.querySelector(`link[rel=stylesheet][href="${href}"]`))
          el.remove();
      });
      host.style.background = ground ?? "transparent";
      frame.style.zIndex = String(zIndex);
      frame.style.removeProperty("opacity");
    },
  };
  ghost.hide(hidden);
  // Mounted now, transparent, beside the body the router replaces: its
  // style, layout and paint happen while the destination is fetched, not in
  // the swap frame. Sheets are adopted after the host is connected, since
  // WebKit ignores sheets adopted by a disconnected shadow root.
  frame.style.opacity = "0";
  root.appendChild(frame);
  if (host.shadowRoot) host.shadowRoot.adoptedStyleSheets = sheets;
  return ghost;
}

// Wave artwork and text captured from the live pages as plain data.
const px = (v: number) => `${Math.round(v * 100) / 100}px`;
export const boxStyle = (b: {
  x: number;
  y: number;
  width: number;
  height?: number;
}) =>
  `left:${px(b.x)};top:${px(b.y)};width:${px(b.width)};` +
  (b.height === undefined ? "" : `height:${px(b.height)};`);
export type Word = { box: DOMRect; text: string; style: string; size: number };
export const viewBox = (svg: SVGSVGElement): wave.Box => {
  const { x, y, width, height } = svg.viewBox.baseVal;
  return { x, y, width, height };
};

export function contourOf(
  box: wave.Box,
  d: string,
  path: SVGPathElement,
  columns: number,
) {
  const contour = wave.waveContour(box, d, columns);
  if (contour) return contour;
  // Arcs and malformed data fall back to the browser for this path only.
  const length = path.getTotalLength();
  const points = Array.from({ length: 257 }, (_, i) =>
    path.getPointAtLength((length * i) / 256),
  );
  return wave.contourColumns(points, box, columns);
}
export function captureArt(host: Element | null | undefined, columns: number) {
  const svg = host?.querySelector("svg");
  const paths = svg ? [...svg.querySelectorAll("path")] : [];
  if (!svg || !paths.length) return;
  let group = 1;
  for (
    let el = paths[0].parentElement;
    el && el !== host;
    el = el.parentElement
  )
    group *= Number(getComputedStyle(el).opacity);
  const box = viewBox(svg);
  const layers = paths.map((path) => {
    const { fill, opacity } = getComputedStyle(path);
    return { d: path.getAttribute("d") || "", fill, opacity: Number(opacity) };
  });
  const contours = paths.map((path, i) =>
    contourOf(box, layers[i].d, path, columns),
  );
  return { box, group, layers, contours } satisfies wave.ArtShape;
}
export function artSvg(art: wave.Art) {
  const make = <K extends "svg" | "g" | "path">(name: K) =>
    document.createElementNS("http://www.w3.org/2000/svg", name);
  const svg = make("svg");
  const { x, y, width, height } = art.box;
  svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.style.cssText = "display:block;width:100%;height:100%;";
  const group = svg.appendChild(make("g"));
  group.setAttribute("opacity", String(art.group));
  const paths = art.layers.map((layer) => {
    const path = group.appendChild(make("path"));
    for (const [name, value] of Object.entries(layer))
      path.setAttribute(name, String(value));
    return path;
  });
  return { svg, group, paths };
}
export function captureText(
  host: Element | null | undefined,
  selectors: string[],
) {
  return selectors.map((selector): Word | null => {
    const el = host?.querySelector<HTMLElement>(selector);
    if (!el) return null;
    const css = getComputedStyle(el);
    const size = parseFloat(css.fontSize);
    const line = parseFloat(css.lineHeight) || size * 1.2;
    const wrap = css.getPropertyValue("text-wrap") || "wrap";
    return {
      box: el.getBoundingClientRect(),
      text: el.textContent || "",
      size,
      style: `font:${css.fontStyle} ${css.fontWeight} ${size}px/${line}px ${css.fontFamily};color:${css.color};letter-spacing:${css.letterSpacing};text-transform:${css.textTransform};text-wrap:${wrap};overflow-wrap:${css.overflowWrap};`,
    };
  });
}
export function morphLayer(plan: wave.MorphPlan) {
  const { svg, group, paths } = artSvg({
    box: wave.MORPH_BOX,
    group: plan.group[0],
    layers: plan.layers.map((l) => ({
      d: "",
      fill: l.fill[0],
      opacity: l.opacity[0],
    })),
  });
  const draw = (e: number) => {
    group.setAttribute(
      "opacity",
      (plan.group[0] + (plan.group[1] - plan.group[0]) * e).toFixed(3),
    );
    plan.layers.forEach(({ a, b, opacity, fill }, i) => {
      paths[i].setAttribute("d", wave.morphPath(a, b, e));
      paths[i].setAttribute(
        "opacity",
        (opacity[0] + (opacity[1] - opacity[0]) * e).toFixed(3),
      );
      if (fill[0] !== fill[1])
        paths[i].setAttribute("fill", wave.mixColor(fill[0], fill[1], e));
    });
  };
  return { svg, draw };
}

/** A choreography overlay: hidden from assistive technology, styled by the
 * writing-transition classes in global.css. */
export function overlay(parent: Element, className: string, style = "") {
  const el = parent.appendChild(document.createElement("div"));
  el.className = className;
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = style;
  return el;
}

/** The opaque surface: page ground, card paper, and the wave wrapper clipped
 * by its own box as well as by the surface. */
export function surfaceLayers(
  ground: string,
  paper: string,
  wrap: wave.Box,
  plan: wave.MorphPlan,
  ghost?: Ghost,
) {
  // Closing folds the old page copy inside the surface, above its waves: the
  // copy's own frame becomes the surface, so it keeps the style and layout
  // it already has and software compositors mask one layer, not two.
  const surface = ghost?.host ?? overlay(document.body, "");
  surface.classList.add("writing-transition-surface");
  const layer = (className: string, style: string) =>
    surface.insertBefore(
      overlay(surface, className, style),
      ghost?.layer ?? null,
    );
  layer("writing-transition-fill", `background:${ground}`);
  const fill = layer("writing-transition-fill", `background:${paper}`);
  const wrapper = layer("writing-transition-waves", boxStyle(wrap));
  const morph = morphLayer(plan);
  wrapper.appendChild(morph.svg);
  return { surface, paper: fill, wrapper, draw: morph.draw };
}

/** Outgoing and incoming copies of one text at their own boxes, with the
 * transforms that carry each onto the other's box. */
export function textPair(name: string, a: Word, b: Word) {
  const [out, incoming] = [a, b].map((word, i) => {
    const { x, y, width } = word.box;
    const style = boxStyle({ x, y, width: width + 1 }) + word.style;
    const el = overlay(document.body, "writing-transition-word", style);
    el.dataset.layer = `${name}-${i ? "in" : "out"}`;
    el.textContent = word.text;
    return el;
  });
  const dx = b.box.x - a.box.x;
  const dy = b.box.y - a.box.y;
  const { IDENTITY, placement } = timeline;
  return {
    out,
    in: incoming,
    outGeometry: [IDENTITY, placement(dx, dy, b.size / a.size)] as [
      string,
      string,
    ],
    inGeometry: [placement(-dx, -dy, a.size / b.size), IDENTITY] as [
      string,
      string,
    ],
  };
}

const nativeArt = new WeakMap<HTMLElement, Node>();
const appliedArt = new WeakMap<HTMLElement, wave.Art>();
/** Shows saved artwork in an article header, or restores its native art. */
export function applyHeaderArt(host: HTMLElement, saved: wave.Art | undefined) {
  const native = host.querySelector("svg");
  if (native && !nativeArt.has(host))
    nativeArt.set(host, native.cloneNode(true));
  if (saved && appliedArt.get(host) !== saved) {
    host.replaceChildren(artSvg(saved).svg);
    appliedArt.set(host, saved);
  } else if (!saved && appliedArt.has(host) && nativeArt.has(host)) {
    host.replaceChildren(nativeArt.get(host)!.cloneNode(true));
    appliedArt.delete(host);
  }
}

/** Idle preparation: ghost stylesheet copies, the header contours of every
 * card on the page (from its seed, no markup needed) and of the current
 * article header, so the swap frame parses and flattens nothing. */
export function warmCaptures(headerSvg: SVGSVGElement | null, columns: number) {
  const task = () => {
    prepareGhostSheets();
    warmStyles();
    document
      .querySelectorAll<HTMLAnchorElement>("a.writing-card")
      .forEach((card) => {
        const seed = new URL(card.href, location.href).pathname.slice(1);
        for (const d of wave.detailCurves(seed))
          wave.waveContour(wave.DETAIL_VIEWBOX, d, columns);
      });
    headerSvg?.querySelectorAll("path").forEach((path) => {
      const d = path.getAttribute("d") || "";
      contourOf(viewBox(headerSvg), d, path, columns);
    });
    const [a, b] = wave
      .detailCurves("writing")
      .map((d) => wave.waveContour(wave.DETAIL_VIEWBOX, d, columns)!);
    const frame = wave.MORPH_BOX;
    for (let i = 0; i < 4; i++)
      wave.morphPath(wave.reframeContour(a, frame, frame), b, i / 4);
    wave.mixColor("rgb(0 0 0)", "rgb(255 255 255)", 0.5);
  };
  if ("requestIdleCallback" in window)
    requestIdleCallback(task, { timeout: 1500 });
  else setTimeout(task, 200);
}
