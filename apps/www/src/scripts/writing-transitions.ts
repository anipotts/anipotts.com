import { prefetch } from "astro:prefetch";
import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from "astro:transitions/client";
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
type Outgoing = ReturnType<typeof captureOutgoing>;
let outgoing: Outgoing | undefined;
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
const isArticlePath = (path: string) => /^\/writing\/[^/]/.test(path);
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
/** Everything read from the outgoing page. It runs as the router starts
 * fetching the destination, so the swap frame does none of this work. */
function captureOutgoing(event: TransitionBeforePreparationEvent) {
  const source = cardFor(document, event.to.pathname);
  const style = source && getComputedStyle(source);
  const oldWaves = document.querySelector(waves);
  const art = (host: Element | null | undefined) =>
    capture.captureArt(host, columns());
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
    sourceWords: capture.captureText(source, cardText),
    sourceArt: art(source?.querySelector(".ambient-flow")),
    // Computed styles are live objects; keep plain values past the swap.
    paper: style && [style.backgroundColor, style.borderTopLeftRadius],
    headerWords: capture.captureText(
      document.querySelector(header),
      headerText,
    ),
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
    ghost: capture.captureGhost(document.querySelector("main")!, hidden),
  };
}

function motion(event: TransitionBeforeSwapEvent, out: Outgoing) {
  const toArticle = !!event.newDocument.querySelector(article);
  const isReturn = out.fromArticle && !toArticle && out.back;
  if (out.source && toArticle && out.sourceArt)
    remember(returnScroll, out.from, out.scroll);
  pending = () => {
    const headerHost = document.querySelector<HTMLElement>(waves);
    const headerBox = headerHost && rect(headerHost);
    const template = out.sourceArt && capture.captureArt(headerHost, columns());
    const opening = !!(
      template &&
      headerBox &&
      out.sourceBox &&
      onScreen(out.sourceBox)
    );
    let plan: wave.MorphPlan | undefined;
    if (opening) {
      plan = wave.planMorph(out.sourceArt!, template!, true, undefined, [
        headerBox!,
        visibleBox(headerBox!),
      ]);
    }
    if (
      isReturn &&
      event.navigationType !== "traverse" &&
      returnScroll.has(out.to)
    )
      scrollTo({ top: returnScroll.get(out.to)!, behavior: "instant" });
    const destination = isReturn ? cardFor(document, out.from) : undefined;
    const targetBox = destination && rect(destination);
    const destArt = capture.captureArt(
      destination?.querySelector(".ambient-flow"),
      columns(),
    );
    const oldWrap = out.oldWaveBox && visibleBox(out.oldWaveBox);
    const closing = !!(
      targetBox &&
      onScreen(targetBox) &&
      out.oldArt &&
      destArt &&
      oldWrap!.height >= 1
    );
    if (closing)
      plan = wave.planMorph(out.oldArt!, destArt!, false, [
        out.oldWaveBox!,
        oldWrap!,
      ]);
    const exit = out.fromArticle && !toArticle && !isReturn;
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
    const card = (opening ? out.sourceBox : targetBox)!;
    const wrap = (opening ? visibleBox(headerBox!) : oldWrap)!;
    const outWords = opening ? out.sourceWords : out.headerWords;
    const inWords = opening
      ? capture.captureText(document.querySelector(header), headerText)
      : capture.captureText(destination, cardText);
    const destStyle = destination && getComputedStyle(destination);
    const [paperColor, radius] = opening
      ? out.paper!
      : [destStyle?.backgroundColor, destStyle?.borderTopLeftRadius];
    const main = document.querySelector<HTMLElement>("main")!;
    const nav = document.querySelector<HTMLElement>("header.nav");
    // Reads are done; everything below writes.
    const root = document.documentElement;
    root.dataset.writingTransition = direction;
    const overlays: Element[] = [out.ghost.host];
    const hidden: HTMLElement[] = [];
    const hide = (el: HTMLElement | null | undefined) => {
      if (el) hidden.push(el);
      el?.style.setProperty("visibility", "hidden");
    };
    const targets = new Map<string, Element[]>([["ghost", [out.ghost.layer]]]);
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
        out.ground,
        paperColor || out.ground,
        wrap,
        plan!,
        opening ? undefined : out.ghost,
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
        out.ghost.show(out.ground, 100);
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
        out.ghost.show(null, 200);
        hide(destination);
        add("hero", document.querySelector("main .page-hero"));
      }
    } else {
      if (out.fromArticle && !toArticle) out.ghost.hide([header, waves]);
      out.ghost.show(null, 100);
      add("main", main);
      if (exit && out.oldArt && out.oldWaveBox) {
        const style = capture.boxStyle(out.oldWaveBox);
        const slide = capture.overlay(
          document.body,
          "writing-transition-slide",
          style,
        );
        overlays.push(slide);
        slide.appendChild(capture.artSvg(out.oldArt).svg);
        add("exit-waves", slide);
        const distance =
          out.oldWaveBox.height + Math.max(0, out.oldWaveBox.top) + 40;
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
    // One shared start at the end of this task rather than a pending start
    // resolved at the next frame, so the first painted frame already moves.
    const start = performance.now();
    for (const a of [...animations, ...lingering]) a.startTime = start;
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
      // The article keeps the card current; build it once the motion is over.
      if (opening) remember(savedArt, out.to, plan!.end());
      applyArt();
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

function dropOutgoing() {
  outgoing?.ghost.host.remove();
  outgoing = undefined;
}
const motionAllowed = () =>
  theme() === "dark" &&
  !reduced.matches &&
  !document.hidden &&
  "animate" in Element.prototype;
document.addEventListener("astro:before-preparation", (raw) => {
  const event = raw as TransitionBeforePreparationEvent;
  dispose(false);
  dropOutgoing();
  pending = undefined;
  const involved =
    !!document.querySelector(article) || isArticlePath(event.to.pathname);
  if (!motionAllowed() || !involved) return;
  // After every other listener, while the destination is fetched.
  queueMicrotask(() => {
    if (!event.signal.aborted) outgoing = captureOutgoing(event);
  });
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
  const out = outgoing;
  if (
    out?.to === event.to.pathname &&
    (fromArticle || toArticle) &&
    motionAllowed()
  ) {
    outgoing = undefined;
    motion(event, out);
  } else dropOutgoing();
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
  // Idle work waits for the motion, so it never lands in a motion frame.
  if (document.documentElement.dataset.writingTransition)
    document.addEventListener("writing:transition-end", warmUp, { once: true });
  else warmUp();
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
window.addEventListener("pagehide", () => {
  dispose(false);
  dropOutgoing();
});
applyArt();
syncTheme();
warmUp();
