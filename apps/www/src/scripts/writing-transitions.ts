import { prefetch } from "astro:prefetch";
import type { TransitionBeforeSwapEvent } from "astro:transitions/client";
import { refreshSharedCurrents } from "../lib/shared-currents";
import * as wave from "../lib/wave-geometry";
import * as timeline from "../lib/writing-timeline";
import * as capture from "./writing-ghost";

type Box = wave.Box;
type Focus = { h1: true } | { card: string } | null;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const phone = matchMedia(timeline.PHONE_MEDIA);
const article = "[data-writing-article]";
const header = `${article} > header`;
const waves = `${article} .detail-waves`;
const headerText = ["h1", ".summary", "time"];
const cardText = [".title", ".sub", "time"];
// Plain data only, a few entries each: artwork is rebuilt from path data.
const savedArt = new Map<string, wave.Art>();
const returnScroll = new Map<string, number>();
let dispose: (focus: boolean) => void = () => {};
let pending: (() => void) | undefined;
let pendingFocus: Focus = null;

const rect = (el: Element) => el.getBoundingClientRect();
const onScreen = (r: DOMRect) =>
  r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.left < innerWidth;
const visibleBox = (r: DOMRect): Box => {
  const x = Math.max(0, r.left);
  const y = Math.max(0, r.top);
  const width = Math.min(innerWidth, r.right) - x;
  return { x, y, width, height: Math.min(innerHeight, r.bottom) - y };
};
const columns = () => (phone.matches ? 17 : wave.CONTOUR_COLUMNS);
const theme = () => document.documentElement.dataset.theme || "light";
function remember<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key);
  map.set(key, value);
  if (map.size > 8) map.delete(map.keys().next().value!);
}
const cardFor = (root: ParentNode, path: string) =>
  [...root.querySelectorAll<HTMLAnchorElement>("a.writing-card")].find(
    (el) => new URL(el.href, location.href).pathname === path,
  );

function applyArt() {
  const host = document.querySelector<HTMLElement>(waves);
  if (!host) return;
  const dark = theme() === "dark";
  capture.applyHeaderArt(
    host,
    dark ? savedArt.get(location.pathname) : undefined,
  );
  if (dark) host.style.opacity = String(timeline.WAVES_RESTING.dark);
  else host.style.removeProperty("opacity");
}
function syncTheme() {
  const root = document.documentElement;
  root.style.colorScheme = theme() === "dark" ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", getComputedStyle(root).backgroundColor);
}
function applyFocus(intent: Focus) {
  pendingFocus = null;
  const el = !intent
    ? null
    : "h1" in intent
      ? document.querySelector<HTMLElement>(`${article} h1`)
      : cardFor(document, intent.card);
  if (el?.tagName === "H1") el.tabIndex = -1;
  el?.focus({ preventScroll: true });
}
function motion(event: TransitionBeforeSwapEvent) {
  const from = event.from.pathname;
  const to = event.to.pathname;
  const fromArticle = !!document.querySelector(article);
  const toArticle = !!event.newDocument.querySelector(article);
  const source = cardFor(document, to);
  const sourceBox = source && rect(source);
  const sourceWords = capture.captureText(source, cardText);
  const sourceArt = capture.captureArt(
    source?.querySelector(".ambient-flow"),
    columns(),
  );
  // Computed styles are live objects; keep plain values past the swap.
  const sourceStyle = source && getComputedStyle(source);
  const paper = sourceStyle && [
    sourceStyle.backgroundColor,
    sourceStyle.borderTopLeftRadius,
  ];
  const headerWords = capture.captureText(
    document.querySelector(header),
    headerText,
  );
  const oldWaves = document.querySelector(waves);
  const oldArt = capture.captureArt(oldWaves, columns());
  const oldWaveBox = oldWaves && rect(oldWaves);
  const ground = getComputedStyle(document.documentElement).backgroundColor;
  const isReturn =
    fromArticle &&
    !toArticle &&
    (event.navigationType === "traverse" ||
      !!event.sourceElement?.closest(".back,.more-heading"));
  if (source && toArticle && sourceArt) remember(returnScroll, from, scrollY);
  const ghost = capture.captureGhost({
    main: document.querySelector("main")!,
    newDocument: event.newDocument,
  });
  pending = () => {
    const headerHost = document.querySelector<HTMLElement>(waves);
    const headerBox = headerHost && rect(headerHost);
    const template = sourceArt && capture.captureArt(headerHost, columns());
    const opening = !!(
      template &&
      headerBox &&
      sourceBox &&
      onScreen(sourceBox)
    );
    let plan: wave.MorphPlan | undefined;
    if (opening) {
      plan = wave.planMorph(sourceArt!, template!, true, undefined, [
        headerBox!,
        visibleBox(headerBox!),
      ]);
      remember(savedArt, to, plan.end);
    }
    if (isReturn && event.navigationType !== "traverse" && returnScroll.has(to))
      scrollTo({ top: returnScroll.get(to)!, behavior: "instant" });
    const destination = isReturn ? cardFor(document, from) : undefined;
    const targetBox = destination && rect(destination);
    const destArt = capture.captureArt(
      destination?.querySelector(".ambient-flow"),
      columns(),
    );
    const oldWrap = oldWaveBox && visibleBox(oldWaveBox);
    const closing = !!(
      targetBox &&
      onScreen(targetBox) &&
      oldArt &&
      destArt &&
      oldWrap!.height >= 1
    );
    if (closing)
      plan = wave.planMorph(oldArt!, destArt!, false, [oldWaveBox!, oldWrap!]);
    const exit = fromArticle && !toArticle && !isReturn;
    const direction = opening
      ? "open"
      : closing
        ? "close"
        : exit
          ? "exit"
          : "fade";
    const stages = timeline.writingTimeline({
      direction,
      phone: phone.matches,
      theme: "dark",
    });
    const card = (opening ? sourceBox : targetBox)!;
    const wrap = (opening ? visibleBox(headerBox!) : oldWrap)!;
    const outWords = opening ? sourceWords : headerWords;
    const inWords = opening
      ? capture.captureText(document.querySelector(header), headerText)
      : capture.captureText(destination, cardText);
    const destStyle = destination && getComputedStyle(destination);
    const [paperColor, radius] = opening
      ? paper!
      : [destStyle?.backgroundColor, destStyle?.borderTopLeftRadius];
    const main = document.querySelector<HTMLElement>("main")!;
    const nav = document.querySelector<HTMLElement>("header.nav");
    // Reads are done; everything below writes.
    applyArt();
    const root = document.documentElement;
    root.dataset.writingTransition = direction;
    const overlays: Element[] = [ghost.host];
    const hidden: HTMLElement[] = [];
    const hide = (el: HTMLElement | null | undefined) => {
      if (el) hidden.push(el);
      el?.style.setProperty("visibility", "hidden");
    };
    const targets = new Map<string, Element[]>([["ghost", [ghost.host]]]);
    const geometry = new Map<string, [string, string]>();
    const add = (name: string, ...els: (Element | null)[]) =>
      targets.set(
        name,
        els.filter((el): el is Element => !!el),
      );
    // Source and destination values; the reverse direction swaps them.
    const pair = (source: string, destination: string): [string, string] =>
      opening ? [source, destination] : [destination, source];
    let draw: ((e: number) => void) | undefined;
    if (opening || closing) {
      const clip = timeline.insetClip(
        card,
        innerWidth,
        innerHeight,
        radius || "12px",
      );
      const { x, y, width, height } = wrap;
      const toCard = timeline.placement(
        card.left - x,
        card.top - y,
        card.width / width,
        card.height / height,
      );
      geometry.set("surface", pair(clip, timeline.FULL_CLIP));
      geometry.set("waves", pair(toCard, timeline.IDENTITY));
      const layers = capture.surfaceLayers(
        ground,
        paperColor || ground,
        wrap,
        plan!,
      );
      draw = layers.draw;
      overlays.push(layers.surface);
      add("surface", layers.surface);
      add("paper", layers.paper);
      add("waves", layers.wrapper);
      ["title", "summary", "date"].forEach((name, i) => {
        const [a, b] = [outWords[i], inWords[i]];
        if (!a || !b) return;
        const text = capture.textPair(name, a, b);
        overlays.push(text.out, text.in);
        add(`${name}-out`, text.out);
        add(`${name}-in`, text.in);
        geometry.set(`${name}-out`, text.outGeometry);
        geometry.set(`${name}-in`, text.inGeometry);
      });
      if (opening) {
        ghost.hide([
          `a.writing-card[href="${source!.getAttribute("href")}"] :is(${cardText})`,
        ]);
        ghost.mount(document.body, ground);
        document
          .querySelectorAll<HTMLElement>(`${header} :is(${headerText})`)
          .forEach(hide);
        hide(headerHost);
        main.style.position = "relative";
        main.style.zIndex = "210";
        add("back", document.querySelector(`${header} .back`));
        add(
          "body",
          ...document.querySelectorAll(
            `${article} > :is(.article-body, .article-end)`,
          ),
        );
      } else {
        // Closing folds the old article copy inside the surface clip.
        ghost.hide([`${header} :is(${headerText})`, waves]);
        ghost.mount(layers.surface, null);
        ghost.host.style.position = "absolute";
        hide(destination);
        add("hero", document.querySelector("main .page-hero"));
      }
    } else {
      ghost.hide(fromArticle && !toArticle ? [header, waves] : []);
      ghost.mount(document.body, null);
      add("main", main);
      if (exit && oldArt && oldWaveBox) {
        const style = capture.boxStyle(oldWaveBox);
        const slide = capture.overlay(
          document.body,
          "writing-transition-slide",
          style,
        );
        overlays.push(slide);
        slide.appendChild(capture.artSvg(oldArt).svg);
        add("exit-waves", slide);
        const distance = oldWaveBox.height + Math.max(0, oldWaveBox.top) + 40;
        geometry.set("exit-waves", [
          "translateY(0px)",
          `translateY(${-Math.round(distance)}px)`,
        ]);
      }
    }
    nav?.style.setProperty("position", "relative");
    nav?.style.setProperty("z-index", "400");

    const animations: Animation[] = [];
    const lingering: Animation[] = [];
    let primary: Animation | undefined;
    let primaryEnd = -1;
    for (const stage of stages) {
      const keyframes = timeline.stageKeyframes(
        stage,
        geometry.get(stage.target),
      );
      const live = timeline.LIVE_TARGETS.includes(stage.target);
      for (const el of keyframes ? targets.get(stage.target) || [] : []) {
        const { delay, duration, easing } = stage;
        const animation = el.animate(keyframes, {
          delay,
          duration,
          easing,
          fill: live ? "backwards" : "both",
        });
        (live ? lingering : animations).push(animation);
        // The surface clocks the handoff; without one, the last stage does.
        const end = stage.target === "surface" ? Infinity : delay + duration;
        if (end > primaryEnd) [primary, primaryEnd] = [animation, end];
      }
    }
    let done = false;
    let frame = 0;
    const finish = (focus: boolean) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      clearTimeout(safety);
      animations.forEach((a) => a.cancel());
      overlays.forEach((el) => el.remove());
      hidden.forEach((el) => el.style.removeProperty("visibility"));
      for (const el of [main, nav]) {
        el?.style.removeProperty("position");
        el?.style.removeProperty("z-index");
      }
      root.removeAttribute("data-writing-transition");
      document.dispatchEvent(new Event("writing:transition-end"));
      if (focus) applyFocus(pendingFocus);
      dispose = () => lingering.forEach((a) => a.cancel());
    };
    dispose = (focus) => {
      finish(focus);
      lingering.forEach((a) => a.cancel());
    };
    // Web Animations drive the choreography. The timeout guarantees the page
    // is shown even if they never finish (a hidden tab, an engine fault).
    const safety = setTimeout(
      () => dispose(true),
      timeline.timelineEnd(stages) + 400,
    );
    if (primary)
      primary.finished.then(
        () => finish(true),
        () => {},
      );
    else finish(true);
    const clock = stages.find((stage) => stage.property === "path");
    const m = draw;
    if (m && clock && primary) {
      const ease = wave.cubicBezier(...timeline.curveOf(clock.easing));
      const surface = primary;
      const tick = () => {
        const t =
          (Number(surface.currentTime ?? 0) - clock.delay) / clock.duration;
        m(ease(Math.max(0, Math.min(1, t))));
        if (!done && t < 1) frame = requestAnimationFrame(tick);
      };
      m(0);
      frame = requestAnimationFrame(tick);
    }
  };
}

document.addEventListener("astro:before-preparation", () => {
  dispose(false);
  pending = undefined;
});
document.addEventListener("astro:before-swap", (raw) => {
  const event = raw as TransitionBeforeSwapEvent;
  const current = theme();
  const next = event.newDocument;
  next.documentElement.dataset.theme = current;
  next.documentElement.dataset.navigationSettled = "";
  void event.viewTransition.ready.catch(() => {});
  event.viewTransition.skipTransition();
  const fromArticle = !!document.querySelector(article);
  const toArticle = !!next.querySelector(article);
  const listing = (doc: Document) =>
    !doc.querySelector(article) && !!doc.querySelector("main a.writing-card");
  // Focus lands in the same place whatever the theme or motion preference.
  pendingFocus =
    toArticle && (fromArticle || listing(document))
      ? { h1: true }
      : fromArticle && listing(next)
        ? { card: event.from.pathname }
        : null;
  if (
    current === "dark" &&
    !reduced.matches &&
    !document.hidden &&
    "animate" in Element.prototype &&
    (fromArticle || toArticle)
  )
    motion(event);
});
document.addEventListener("astro:after-swap", () => {
  refreshSharedCurrents();
  syncTheme();
  const run = pending;
  pending = undefined;
  if (run) run();
  else applyFocus(pendingFocus);
});
const warmUp = () =>
  capture.warmCaptures(document.querySelector(`${waves} svg`), columns());
document.addEventListener("astro:page-load", () => {
  applyArt();
  syncTheme();
  document.querySelectorAll<HTMLAnchorElement>(".nav-link").forEach((link) => {
    const path = location.pathname;
    const active =
      path === link.pathname || path.startsWith(link.pathname + "/");
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  warmUp();
});
// The destination is requested the moment a finger or pointer lands.
const warm = (event: Event) => {
  const link = (event.target as Element | null)?.closest?.(
    "a.writing-card, a.back, .more-heading a",
  );
  if (
    link instanceof HTMLAnchorElement &&
    link.origin === location.origin &&
    link.pathname !== location.pathname
  )
    prefetch(link.href, { ignoreSlowConnection: true });
};
for (const type of ["pointerdown", "touchstart"])
  document.addEventListener(type, warm, { capture: true, passive: true });
let observedTheme = document.documentElement.dataset.theme;
new MutationObserver(() => {
  if (document.documentElement.dataset.theme === observedTheme) return;
  observedTheme = document.documentElement.dataset.theme;
  dispose(true);
  applyArt();
  syncTheme();
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
reduced.addEventListener("change", () => dispose(true));
// Only a width change invalidates captured geometry; a phone toolbar
// collapsing changes the height alone and must not abort the motion.
let observedWidth = innerWidth;
window.addEventListener("resize", () => {
  if (innerWidth === observedWidth) return;
  observedWidth = innerWidth;
  dispose(true);
});
window.addEventListener("pagehide", () => dispose(false));
applyArt();
syncTheme();
warmUp();
