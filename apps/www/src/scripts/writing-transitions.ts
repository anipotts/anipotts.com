import { prefetch } from "astro:prefetch";
import type {
  TransitionBeforePreparationEvent,
  TransitionBeforeSwapEvent,
} from "astro:transitions/client";
import { refreshSharedCurrents } from "../lib/shared-currents";
import * as wave from "../lib/wave-geometry";
import * as timeline from "../lib/writing-timeline";
import * as capture from "./writing-ghost";

type Focus = { h1: true } | { card: string } | null;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const phone = matchMedia(timeline.PHONE_MEDIA);
const { article, header, waves, headerText, cardText } = capture;
const { rect, onScreen, visibleBox, cardFor, isArticlePath } = capture;
// Plain data only, a few entries each: artwork is rebuilt from path data.
const savedArt = new Map<string, wave.Art>();
const returnScroll = new Map<string, number>();
let dispose: (focus: boolean) => void = () => {};
let pending: (() => void) | undefined;
type Outgoing = capture.Outgoing;
let outgoing: Outgoing | undefined;
let pendingFocus: Focus = null;
let swapFocus: Element | null = null;
let keyboard = false;
let swapAt = 0;

const columns = () => (phone.matches ? 17 : wave.CONTOUR_COLUMNS);
const theme = () => document.documentElement.dataset.theme || "light";
function remember<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key);
  map.set(key, value);
  if (map.size > 8) map.delete(map.keys().next().value!);
}
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
  // Focus the visitor moved while the motion ran stays where they put it.
  const active = document.activeElement;
  if (!intent || (active && active !== document.body && active !== swapFocus))
    return;
  capture.land(
    "h1" in intent
      ? document.querySelector<HTMLElement>(`${article} h1`)
      : cardFor(document, intent.card),
    keyboard,
  );
}
function motion(event: TransitionBeforeSwapEvent, out: Outgoing) {
  const toArticle = !!event.newDocument.querySelector(article);
  const isReturn = out.fromArticle && !toArticle && out.back;
  if (out.source && toArticle && out.sourceArt)
    remember(returnScroll, out.from, out.scroll);
  pending = () => {
    // The viewport changed width while the destination loaded: every box
    // read from the outgoing page is stale, so the swap stays instant.
    if (innerWidth !== out.width) {
      out.ghost.host.remove();
      return applyFocus(pendingFocus);
    }
    const headerHost = document.querySelector<HTMLElement>(waves);
    const headerBox = headerHost && rect(headerHost);
    const template = out.sourceArt && capture.captureArt(headerHost, columns());
    const opening = !!(
      template &&
      headerBox &&
      out.sourceBox &&
      onScreen(out.sourceBox)
    );
    let plan: wave.MorphPlan | undefined = opening
      ? wave.planMorph(out.sourceArt!, template!, true, undefined, [
          headerBox!,
          visibleBox(headerBox!),
        ])
      : undefined;
    const destination = isReturn ? cardFor(document, out.from) : undefined;
    if (isReturn && event.navigationType !== "traverse") {
      const saved = returnScroll.get(out.to);
      if (saved !== undefined) scrollTo({ top: saved, behavior: "instant" });
      // No remembered scroll (an article loaded directly): the card comes
      // into view, so the article folds into it and focus lands in sight.
      else if (destination && !onScreen(rect(destination)))
        destination.scrollIntoView({ block: "nearest" });
    }
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
    const icon = opening ? out.sourceIcon : capture.captureIcon(destination);
    const destStyle = destination && getComputedStyle(destination);
    const [paperColor, radius] = opening
      ? out.paper!
      : [destStyle?.backgroundColor, destStyle?.borderTopLeftRadius];
    const main = document.querySelector<HTMLElement>("main")!;
    const nav = document.querySelector<HTMLElement>("header.nav");
    // The persisted nav was scrolled out of view on the outgoing page; it
    // arrives with the incoming page instead of over the old copy.
    const navIn = out.navOnScreen ? null : nav;
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
      geometry.set("surface", pair(clip, timeline.FULL_CLIP));
      const layers = capture.surfaceLayers(
        out.ground,
        paperColor || out.ground,
        [wrap, card, opening],
        plan!,
        opening ? undefined : out.ghost,
      );
      draw = layers.draw;
      overlays.push(layers.surface);
      add("surface", layers.surface);
      add("paper", layers.paper);
      add("waves", layers.wrapper);
      // Text travels inside the surface: when the clip, sampled on the main
      // thread, trails the composited text, the text is clipped with the
      // card rather than drawn over the old page.
      const text = capture.textLayers(outWords, inWords, layers.surface);
      for (const [name, el, move] of text) {
        overlays.push(el);
        add(name, el);
        geometry.set(name, move);
      }
      if (icon)
        add(
          opening ? "icon-out" : "icon-in",
          capture.iconLayer(icon, layers.surface),
        );
      if (opening) {
        out.ghost.show(out.ground, 100);
        document
          .querySelectorAll<HTMLElement>(`${header} :is(${headerText})`)
          .forEach(hide);
        hide(headerHost);
        main.style.position = "relative";
        main.style.zIndex = "210";
        add("back", document.querySelector(`${header} .back`), navIn);
        add(
          "body",
          ...document.querySelectorAll(
            `${article} > :is(.article-body, .article-end)`,
          ),
        );
      } else {
        out.ghost.show(null, 200);
        hide(destination);
        add("hero", document.querySelector("main .page-hero"), navIn);
      }
    } else {
      if (out.fromArticle && !toArticle) out.ghost.hide([header, waves]);
      out.ghost.show(null, 100);
      add("main", main, navIn);
      if (exit && out.oldArt && out.oldWaveBox) {
        const slide = capture.exitSlide(out.oldArt, out.oldWaveBox);
        overlays.push(slide.el);
        add("exit-waves", slide.el);
        geometry.set("exit-waves", slide.geometry);
      }
    }
    nav?.style.setProperty("position", "relative");
    nav?.style.setProperty("z-index", "400");

    const animations: Animation[] = [];
    const lingering: Animation[] = [];
    let primary: Animation | undefined;
    let primaryEnd = -1;
    let surfaceClock: Animation | undefined;
    const bound: Animation[] = [];
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
        if (timeline.CLIP_BOUND.includes(stage.target)) bound.push(animation);
        if (stage.target === "surface") surfaceClock ??= animation;
        // The last stage to end keys the handoff.
        const end = delay + duration;
        if (!live && end >= primaryEnd)
          [primary, primaryEnd] = [animation, end];
      }
    }
    // One shared start at the end of this task rather than a pending start
    // resolved at the next frame, so the first painted frame already moves.
    const start = performance.now();
    for (const a of [...animations, ...lingering]) a.startTime = start;
    // The clip samples on the main thread. After a slow swap the frames that
    // follow run late and it trails the composited text and waves by about
    // as long as the swap took; opening layers that travel outward start
    // that much later, so they never overtake the clip edge.
    const lag = Math.min(50, start - swapAt - 16);
    if (opening && lag > 0) for (const a of bound) a.startTime = start + lag;
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
    const [m, surface] = [draw, surfaceClock];
    if (!m || !clock || !surface) return;
    // Path data follows the surface animation's own clock, frame by frame.
    const ease = wave.cubicBezier(...timeline.curveOf(clock.easing));
    const tick = () => {
      const t =
        (Number(surface.currentTime ?? 0) - clock.delay) / clock.duration;
      m(ease(Math.max(0, Math.min(1, t))));
      if (!done && t < 1) frame = requestAnimationFrame(tick);
    };
    m(0);
    frame = requestAnimationFrame(tick);
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
    if (!event.signal.aborted)
      outgoing = capture.captureOutgoing(event, columns());
  });
});
document.addEventListener("astro:before-swap", (raw) => {
  const event = raw as TransitionBeforeSwapEvent;
  swapAt = performance.now();
  const current = theme();
  const next = event.newDocument;
  next.documentElement.dataset.theme = current;
  next.documentElement.dataset.navigationSettled = "";
  void event.viewTransition.ready.catch(() => {});
  event.viewTransition.skipTransition();
  const fromArticle = !!document.querySelector(article);
  const toArticle = !!next.querySelector(article);
  // Focus lands in the same place whatever the theme or motion preference.
  pendingFocus = capture.landing(document, next, event.from.pathname);
  const out = outgoing;
  if (
    out?.to === event.to.pathname &&
    out.width === innerWidth &&
    (fromArticle || toArticle) &&
    motionAllowed()
  ) {
    outgoing = undefined;
    motion(event, out);
  } else dropOutgoing();
});
document.addEventListener("astro:after-swap", () => {
  swapFocus = document.activeElement;
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
// Focus rings after a navigation follow how the visitor last navigated.
const modality = (event: Event) => (keyboard = event.type === "keydown");
for (const type of ["pointerdown", "touchstart", "keydown"])
  document.addEventListener(type, modality, { capture: true, passive: true });
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
reduced.addEventListener("change", () => {
  const intent = pendingFocus;
  dispose(false);
  // Style is not yet current inside a media query change: focus waits a task.
  if (intent) setTimeout(() => applyFocus(intent));
});
// Only a width change invalidates captured geometry; a phone toolbar
// collapsing changes the height alone and must not abort the motion.
let observedWidth = innerWidth;
window.addEventListener("resize", () => {
  if (innerWidth === observedWidth) return;
  observedWidth = innerWidth;
  dispose(true);
  dropOutgoing();
});
window.addEventListener("pagehide", () => {
  dispose(false);
  dropOutgoing();
});
applyArt();
syncTheme();
warmUp();
