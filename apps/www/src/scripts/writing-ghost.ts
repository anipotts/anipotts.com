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
import type { TransitionBeforePreparationEvent } from "astro:transitions/client";
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
const inheritedText = [
  "color",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "font-stretch",
  "font-feature-settings",
  "font-variation-settings",
  "font-kerning",
  "line-height",
  "letter-spacing",
  "word-spacing",
  "text-rendering",
  "-webkit-font-smoothing",
  "-webkit-text-size-adjust",
  "text-size-adjust",
];

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
    // Padding is pinned: root-scoped rules (html.editorial-detail .page)
    // follow the incoming root in the light-DOM copy.
    const { paddingTop, paddingRight, paddingBottom, paddingLeft } =
      getComputedStyle(source);
    const el = source.cloneNode(true) as HTMLElement;
    el.style.cssText = `position:absolute;left:${box.left}px;top:${box.top}px;width:${box.width}px;margin:0;padding:${paddingTop} ${paddingRight} ${paddingBottom} ${paddingLeft};box-sizing:border-box;${height ? `height:${box.height}px;` : ""}`;
    return el;
  };

  const parts: HTMLElement[] = [];
  const current = document.querySelector<HTMLElement>("body > .page-current");
  if (current) parts.push(copy(current, true));
  // The nav and footer are copied too when they are in view: the incoming
  // page starts at its own top, so without them a scrolled page would lose
  // its footer, and the incoming nav would stand on the old body copy.
  for (const selector of ["body > header.nav", "body > footer"]) {
    const el = document.querySelector<HTMLElement>(selector);
    const box = el?.getBoundingClientRect();
    if (el && box && box.bottom > 0 && box.top < innerHeight)
      parts.push(copy(el, true));
  }
  // Blocks entirely below the fold are never seen; leave them out.
  const live = [...main.querySelectorAll<HTMLElement>(trimmed)];
  const below = live.map((el) => el.getBoundingClientRect().top > innerHeight);
  const clone = copy(main, false);
  const copies = [...clone.querySelectorAll<HTMLElement>(trimmed)];
  if (copies.length === live.length)
    copies.forEach((el, i) => below[i] && el.remove());
  parts.push(clone);
  // Icons reference shared symbols by id; keep the ids the copy uses.
  const used = new Set<string>();
  for (const part of parts) {
    part.inert = true;
    part.querySelectorAll("script").forEach((el) => el.remove());
    part
      .querySelectorAll("use")
      .forEach((el) => used.add((el.getAttribute("href") || "").slice(1)));
    part
      .querySelectorAll("[data-rise]")
      .forEach((el) => el.removeAttribute("data-rise"));
  }
  for (const part of parts)
    part
      .querySelectorAll("[id]")
      .forEach((el) => used.has(el.id) || el.removeAttribute("id"));
  const symbols = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  symbols.style.display = "none";
  for (const id of used)
    if (!parts.some((part) => part.querySelector(`[id="${CSS.escape(id)}"]`))) {
      const symbol = document.getElementById(id);
      if (symbol) symbols.appendChild(symbol.cloneNode(true));
    }
  clone.appendChild(symbols);
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
  // The light-DOM copy sits outside <body>, so body rules never reach it:
  // it takes the body's inherited text styles directly. The shadow copy
  // gets them from body rules rewritten for its host.
  if (!sheets.length) {
    const body = getComputedStyle(document.body);
    for (const name of inheritedText)
      scope.style.setProperty(name, body.getPropertyValue(name));
    // A unitless body line height scales with each element's font size.
    const ratio = parseFloat(body.lineHeight) / parseFloat(body.fontSize);
    if (ratio) scope.style.lineHeight = String(Math.round(ratio * 1e4) / 1e4);
    // Root custom properties follow the incoming root; pin the outgoing ones.
    const rootStyle = getComputedStyle(root);
    const names = new Set<string>();
    for (const sheet of document.styleSheets)
      try {
        for (const rule of sheet.cssRules)
          for (const [, name] of rule.cssText.matchAll(/(--[\w-]+)\s*:/g))
            names.add(name);
      } catch {
        // Cross-origin sheets cannot be read and define no site tokens.
      }
    for (const name of names)
      scope.style.setProperty(name, rootStyle.getPropertyValue(name));
  }
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
 * by its own box as well as by the surface. `draw(e)` sets the morph and the
 * wrapper transform, from its own box on open to the card box, at eased
 * progress e. Both run on the surface clock with no animation of their own,
 * so the wrapper edges stay on the clip edge even when frames run late. */
export function surfaceLayers(
  ground: string,
  paper: string,
  [wrap, card, opening]: [wave.Box, DOMRect, boolean],
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
  const [dx, dy] = [card.left - wrap.x, card.top - wrap.y];
  const [sx, sy] = [card.width / wrap.width, card.height / wrap.height];
  const draw = (e: number) => {
    const k = opening ? 1 - e : e;
    morph.draw(e);
    wrapper.style.transform = timeline.placement(
      dx * k,
      dy * k,
      1 + (sx - 1) * k,
      1 + (sy - 1) * k,
    );
  };
  return { surface, paper: fill, wrapper, draw };
}

/** Outgoing and incoming copies of the title, summary and date at their
 * own boxes, each with the transform pair that carries it between boxes:
 * [layer name, element, [source transform, destination transform]]. */
export function textLayers(
  outgoing: (Word | null)[],
  incoming: (Word | null)[],
  surface: HTMLElement,
) {
  const { IDENTITY, placement } = timeline;
  const layers: [string, HTMLElement, [string, string]][] = [];
  ["title", "summary", "date"].forEach((name, i) => {
    const [a, b] = [outgoing[i], incoming[i]];
    if (!b) return;
    const make = (word: Word, layer: string) => {
      const { x, y, width } = word.box;
      const style = boxStyle({ x, y, width: width + 1 }) + word.style;
      const el = overlay(surface, "writing-transition-word", style);
      el.dataset.layer = layer;
      el.textContent = word.text;
      return el;
    };
    // No outgoing copy (it was off screen): the incoming one fades in place.
    if (!a)
      return layers.push([
        `${name}-in`,
        make(b, `${name}-in`),
        [IDENTITY, IDENTITY],
      ]);
    const dx = b.box.x - a.box.x;
    const dy = b.box.y - a.box.y;
    layers.push(
      [
        `${name}-out`,
        make(a, `${name}-out`),
        [IDENTITY, placement(dx, dy, b.size / a.size)],
      ],
      [
        `${name}-in`,
        make(b, `${name}-in`),
        [placement(-dx, -dy, a.size / b.size), IDENTITY],
      ],
    );
  });
  return layers;
}

/** Where focus lands after a navigation between the listing and articles:
 * the article h1 on open, the originating card on return. */
export function landing(from: Document, to: Document, path: string) {
  const listing = (doc: Document) =>
    !doc.querySelector(article) && !!doc.querySelector("main a.writing-card");
  const [fromArticle, toArticle] = [from, to].map(
    (doc) => !!doc.querySelector(article),
  );
  if (toArticle && (fromArticle || listing(from))) return { h1: true as const };
  return fromArticle && listing(to) ? { card: path } : null;
}

/** Moves focus to where a navigation lands. A tap or click lands it without
 * a ring (WebKit draws one for programmatic focus); a card below the fold is
 * brought into view. */
export function land(el: HTMLElement | null | undefined, keyboard: boolean) {
  if (!el) return;
  if (el.tagName === "H1") el.tabIndex = -1;
  // The ring is suppressed for a tap or a click, on the article heading as
  // well as on the card: a heading focused by keyboard keeps its ring, which
  // is the only indicator a keyboard visitor gets that focus moved with the
  // navigation.
  if (!keyboard) {
    el.dataset.pointerFocus = "";
    const clear = () => delete el.dataset.pointerFocus;
    el.addEventListener("blur", clear, { once: true });
  }
  const focus = () =>
    el.focus({ preventScroll: true, focusVisible: keyboard } as FocusOptions);
  focus();
  // Focus does not take while style still reads the element hidden (inside
  // a media query change, or a frame that has not restyled yet): try once
  // more after the next style update.
  if (document.activeElement !== el)
    requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body) focus();
    });
  if (!onScreen(rect(el))) el.scrollIntoView({ block: "nearest" });
}

export type Icon = { box: DOMRect; svg: SVGSVGElement; color: string };

/** A card's arrow icon as a standalone copy, its shared symbol inlined. */
export function captureIcon(
  card: Element | null | undefined,
): Icon | undefined {
  const icon = card?.querySelector<SVGSVGElement>("svg.affordance");
  const box = icon?.getBoundingClientRect();
  if (!icon || !box?.width) return;
  const svg = icon.cloneNode(true) as SVGSVGElement;
  svg.querySelectorAll("use").forEach((use) => {
    const id = (use.getAttribute("href") || "").slice(1);
    const symbol = id ? document.getElementById(id) : null;
    const viewBox = symbol?.getAttribute("viewBox");
    if (viewBox && !svg.hasAttribute("viewBox"))
      svg.setAttribute("viewBox", viewBox);
    use.replaceWith(
      ...[...(symbol?.childNodes ?? [])].map((node) => node.cloneNode(true)),
    );
  });
  svg.querySelectorAll("symbol").forEach((el) => el.remove());
  svg.removeAttribute("class");
  svg.style.cssText = "display:block;width:100%;height:100%;";
  return { box, svg, color: getComputedStyle(icon).color };
}

/** The icon copy at its own box inside the surface, for an in-place fade. */
export function iconLayer(icon: Icon, surface: HTMLElement) {
  const { x, y, width, height } = icon.box;
  const style = boxStyle({ x, y, width, height }) + `color:${icon.color};`;
  const el = overlay(surface, "writing-transition-icon", style);
  el.appendChild(icon.svg);
  return el;
}

/** The article header waves copied for the exit to a non-writing page, and
 * the slide that carries them up past the top of the viewport. */
export function exitSlide(art: wave.Art, box: DOMRect) {
  const el = overlay(document.body, "writing-transition-slide", boxStyle(box));
  el.appendChild(artSvg(art).svg);
  const distance = box.height + Math.max(0, box.top) + 40;
  const geometry: [string, string] = [
    "translateY(0px)",
    `translateY(${-Math.round(distance)}px)`,
  ];
  return { el, geometry };
}

// Selectors and page reads shared by the capture and the choreography.
export const article = "[data-writing-article]";
export const header = `${article} > header`;
export const waves = `${article} .detail-waves`;
export const headerText = ["h1", ".summary", "time"];
export const cardText = [".title", ".sub", "time"];
export const rect = (el: Element) => el.getBoundingClientRect();
export const onScreen = (r: DOMRect) =>
  r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.left < innerWidth;
export const visibleBox = (r: DOMRect): wave.Box => {
  const x = Math.max(0, r.left);
  const y = Math.max(0, r.top);
  const width = Math.min(innerWidth, r.right) - x;
  return { x, y, width, height: Math.min(innerHeight, r.bottom) - y };
};
export const isArticlePath = (path: string) => /^\/writing\/[^/]/.test(path);
export const cardFor = (root: ParentNode, path: string) =>
  [...root.querySelectorAll<HTMLAnchorElement>("a.writing-card")].find(
    (el) => new URL(el.href, location.href).pathname === path,
  );

/** Everything read from the outgoing page. It runs as the router starts
 * fetching the destination, so the swap frame does none of this work. */
export function captureOutgoing(
  event: TransitionBeforePreparationEvent,
  columns: number,
) {
  const source = cardFor(document, event.to.pathname);
  const style = source && getComputedStyle(source);
  const oldWaves = document.querySelector(waves);
  const art = (host: Element | null | undefined) => captureArt(host, columns);
  const sourceBox = source && rect(source);
  const read = {
    from: event.from.pathname,
    to: event.to.pathname,
    fromArticle: !!document.querySelector(article),
    back:
      event.navigationType === "traverse" ||
      !!event.sourceElement?.closest(".back,.more-heading"),
    source,
    sourceBox,
    sourceWords: captureText(source, cardText),
    sourceIcon: captureIcon(source),
    navOnScreen: (() => {
      const nav = document.querySelector("body > header.nav");
      const box = nav?.getBoundingClientRect();
      return !!box && box.bottom > 0 && box.top < innerHeight;
    })(),
    width: innerWidth,
    sourceArt: art(source?.querySelector(".ambient-flow")),
    // Computed styles are live objects; keep plain values past the swap.
    paper: style && [style.backgroundColor, style.borderTopLeftRadius],
    headerWords: captureText(document.querySelector(header), headerText),
    oldArt: art(oldWaves),
    oldWaveBox: oldWaves && rect(oldWaves),
    ground: getComputedStyle(document.documentElement).backgroundColor,
    scroll: scrollY,
  };
  // The copy mounts last, after every read. It stands in for the live
  // source card, or for the header whose text and waves the motion carries.
  const hidden =
    sourceBox && onScreen(sourceBox)
      ? [
          `a.writing-card[href="${source!.getAttribute("href")}"] :is(${cardText})`,
        ]
      : oldWaves && !isArticlePath(event.to.pathname)
        ? [`${header} :is(${headerText})`, waves]
        : [];
  return {
    ...read,
    ghost: captureGhost(document.querySelector("main")!, hidden),
  };
}

export type Outgoing = ReturnType<typeof captureOutgoing>;

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
