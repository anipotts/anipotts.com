import { refreshSharedCurrents } from "../lib/shared-currents";
import type { TransitionBeforeSwapEvent } from "astro:transitions/client";

const DURATION = 550;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const articleSelector = "[data-writing-article]";
const headerSelector = `${articleSelector} > header`;
const originalArtwork = new WeakMap<HTMLElement, SVGSVGElement>();
const artwork = new Map<string, SVGSVGElement>();
const cardArtwork = new Map<string, SVGSVGElement>();
const returnScroll = new Map<string, number>();
let dispose = () => {};
let pending: (() => void) | undefined;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {
  const t = clamp(v);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const rect = (el: Element) => el.getBoundingClientRect();
const visible = (r: DOMRect) =>
  r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
function remember<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key);
  map.set(key, value);
  if (map.size > 40) map.delete(map.keys().next().value!);
}
function captureArt(host: Element | null): SVGSVGElement | undefined {
  const source = host?.querySelector("svg");
  if (!source) return;
  const svg = source.cloneNode(false) as SVGSVGElement;
  svg.removeAttribute("id");
  svg.setAttribute("preserveAspectRatio", "none");
  source.querySelectorAll("path").forEach((path) => {
    const copy = path.cloneNode(false) as SVGPathElement;
    const style = getComputedStyle(path);
    copy.removeAttribute("class");
    copy.removeAttribute("id");
    copy.setAttribute("fill", style.fill);
    let opacity = Number(style.opacity);
    for (
      let parent = path.parentElement;
      parent && parent !== source.parentElement;
      parent = parent.parentElement
    )
      opacity *= Number(getComputedStyle(parent).opacity);
    copy.setAttribute("opacity", String(opacity));
    svg.appendChild(copy);
  });
  svg.style.cssText = "display:block;width:100%;height:100%;";
  return svg;
}
function captureText(host: Element | null | undefined, card: boolean) {
  return (card ? [".title", ".sub", "time"] : ["h1", ".summary", "time"]).map(
    (selector) => {
      const el = host?.querySelector<HTMLElement>(selector);
      if (!el) return null;
      const css = getComputedStyle(el);
      return {
        box: rect(el),
        text: el.textContent || "",
        font: css.fontFamily,
        size: parseFloat(css.fontSize),
        line: parseFloat(css.lineHeight) || parseFloat(css.fontSize) * 1.2,
        weight: css.fontWeight,
        color: css.color,
        spacing: css.letterSpacing,
      };
    },
  );
}
type Contour = { x: number; top: number; bottom: number }[];
function contours(svg: SVGSVGElement): Contour[] {
  const v = svg.viewBox.baseVal;
  return [...svg.querySelectorAll("path")].map((path) => {
    const length = path.getTotalLength();
    const pts = Array.from({ length: 257 }, (_, i) =>
      path.getPointAtLength((length * i) / 256),
    );
    return Array.from({ length: 33 }, (_, i) => {
      const x = v.x + (v.width * i) / 32,
        ys: number[] = [];
      for (let j = 1; j < pts.length; j++) {
        const a = pts[j - 1],
          b = pts[j];
        if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x))
          ys.push(mix(a.y, b.y, (x - a.x) / (b.x - a.x)));
      }
      const norm = (y: number) =>
        Math.max(-100, Math.min(900, ((y - v.y) / v.height) * 800));
      return {
        x: (i * 1440) / 32,
        top: ys.length ? norm(Math.min(...ys)) : 900,
        bottom: ys.length ? norm(Math.max(...ys)) : 900,
      };
    });
  });
}
function contourPath(points: Contour) {
  const line = (pts: { x: number; y: number }[]) =>
    pts
      .slice(1)
      .map((c, i) => {
        const a = pts[Math.max(0, i - 1)],
          b = pts[i],
          d = pts[Math.min(pts.length - 1, i + 2)];
        return `C${b.x + (c.x - a.x) / 6} ${b.y + (c.y - a.y) / 6} ${c.x - (d.x - b.x) / 6} ${c.y - (d.y - b.y) / 6} ${c.x} ${c.y}`;
      })
      .join("");
  const top = points.map((p) => ({ x: p.x, y: p.top })),
    bottom = points.map((p) => ({ x: p.x, y: p.bottom })).reverse();
  return `M${top[0].x} ${top[0].y}${line(top)}L${bottom[0].x} ${bottom[0].y}${line(bottom)}Z`;
}
function morphArtwork(
  source: SVGSVGElement,
  target: SVGSVGElement,
  header = false,
) {
  const a = contours(source),
    b = contours(target),
    svg = source.cloneNode(true) as SVGSVGElement;
  svg.setAttribute("viewBox", "0 0 1440 800");
  const paths = [...svg.querySelectorAll("path")];
  const sourceOpacity = paths.map((path) =>
    Number(path.getAttribute("opacity") || 1),
  );
  const targetPaths = [...target.querySelectorAll("path")];
  const draw = (e: number) =>
    paths.forEach((path, i) => {
      path.setAttribute(
        "d",
        contourPath(
          a[i].map((p, j) => ({
            x: p.x,
            top: mix(p.top, b[i % b.length][j].top, e),
            bottom: mix(p.bottom, b[i % b.length][j].bottom, e),
          })),
        ),
      );
      const targetOpacity = header
        ? sourceOpacity[i] * 0.5
        : Number(
            targetPaths[i % targetPaths.length].getAttribute("opacity") || 1,
          );
      path.setAttribute(
        "opacity",
        String(mix(sourceOpacity[i], targetOpacity, e)),
      );
    });
  return { svg, draw };
}

function applyArt() {
  const host = document.querySelector<HTMLElement>(
    `${articleSelector} .detail-waves`,
  );
  if (!host) return;
  if (!originalArtwork.has(host)) {
    const native = host.querySelector("svg");
    if (native)
      originalArtwork.set(host, native.cloneNode(true) as SVGSVGElement);
  }
  const dark = document.documentElement.dataset.theme === "dark";
  const saved = dark
    ? artwork.get(location.pathname)
    : originalArtwork.get(host);
  if (saved) host.replaceChildren(saved.cloneNode(true));
  if (dark) host.style.opacity = "0.75";
  else host.style.removeProperty("opacity");
}
function syncTheme() {
  const root = document.documentElement;
  root.style.colorScheme = root.dataset.theme === "dark" ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", getComputedStyle(root).backgroundColor);
}
function motion(event: TransitionBeforeSwapEvent) {
  dispose();
  const fromArticle = document.querySelector<HTMLElement>(articleSelector);
  const toArticle = event.newDocument.querySelector(articleSelector);
  const source = [
    ...document.querySelectorAll<HTMLAnchorElement>("a.writing-card"),
  ].find((el) => new URL(el.href).pathname === event.to.pathname);
  const sourceBox = source ? rect(source) : null;
  const sourceText = captureText(source, true);
  const header = document.querySelector(headerSelector);
  const headerText = captureText(header, false);
  const oldWaves = document.querySelector(`${articleSelector} .detail-waves`);
  const oldArt = captureArt(oldWaves);
  const oldWaveBox = oldWaves ? rect(oldWaves) : null;
  const cardArt = captureArt(source?.querySelector(".ambient-flow") || null);
  const background = source
    ? getComputedStyle(source).backgroundColor
    : getComputedStyle(document.documentElement).backgroundColor;
  const priorScroll = scrollY;
  if (source && toArticle && cardArt) {
    remember(cardArtwork, event.to.pathname, cardArt);
    remember(returnScroll, event.from.pathname, priorScroll);
  }
  const oldMain = document.querySelector<HTMLElement>("main")!;
  const oldBox = rect(oldMain);
  const ghost = oldMain.cloneNode(true) as HTMLElement;
  ghost.querySelectorAll("script").forEach((el) => el.remove());
  ghost.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
  ghost.inert = true;
  ghost.setAttribute("aria-hidden", "true");
  ghost.style.cssText = `position:fixed;left:${oldBox.left}px;top:${oldBox.top}px;width:${oldBox.width}px;margin:0;z-index:100;pointer-events:none;`;
  const sourceGhost = [
    ...ghost.querySelectorAll<HTMLAnchorElement>("a.writing-card"),
  ].find((el) => new URL(el.href).pathname === event.to.pathname);
  if (sourceGhost && toArticle) sourceGhost.style.visibility = "hidden";
  if (fromArticle && !toArticle)
    ghost
      .querySelector<HTMLElement>("header")
      ?.style.setProperty("visibility", "hidden");
  pending = () => {
    const headerHost = document.querySelector<HTMLElement>(
      `${articleSelector} .detail-waves`,
    );
    const template = captureArt(headerHost);
    let shapeMotion: ReturnType<typeof morphArtwork> | undefined;
    if (toArticle && cardArt && template) {
      shapeMotion = morphArtwork(cardArt, template, true);
      shapeMotion.draw(1);
      remember(
        artwork,
        event.to.pathname,
        shapeMotion.svg.cloneNode(true) as SVGSVGElement,
      );
    }
    applyArt();
    const isReturn =
      !!fromArticle &&
      !toArticle &&
      (event.navigationType === "traverse" ||
        !!event.sourceElement?.closest(".back,.more-heading"));
    if (
      isReturn &&
      event.navigationType !== "traverse" &&
      returnScroll.has(event.to.pathname)
    )
      scrollTo({
        top: returnScroll.get(event.to.pathname)!,
        behavior: "instant",
      });
    const destination = [
      ...document.querySelectorAll<HTMLAnchorElement>("a.writing-card"),
    ].find((el) => new URL(el.href).pathname === event.from.pathname);
    const targetBox = destination ? rect(destination) : null;
    const expanding =
      !!toArticle && !!sourceBox && visible(sourceBox) && !!cardArt;
    const shrinking = isReturn && !!targetBox && visible(targetBox) && !!oldArt;
    const main = document.querySelector<HTMLElement>("main")!;
    const nav = document.querySelector<HTMLElement>("header.nav");
    const hidden: HTMLElement[] = [];
    const overlays: HTMLElement[] = [ghost];
    document.body.appendChild(ghost);
    let surface: HTMLDivElement | undefined;
    let svg: SVGSVGElement | undefined;
    let words: {
      el: HTMLDivElement;
      from: NonNullable<ReturnType<typeof captureText>[number]>;
      to: NonNullable<ReturnType<typeof captureText>[number]>;
      index: number;
    }[] = [];
    const targetWaves = document.querySelector<HTMLElement>(
      `${articleSelector} .detail-waves`,
    );
    const targetWaveBox = targetWaves ? rect(targetWaves) : null;
    const finalBackground = getComputedStyle(
      document.documentElement,
    ).backgroundColor;
    const rgb = (color: string) =>
      (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const startRGB = rgb(expanding ? background : finalBackground);
    const endRGB = rgb(
      shrinking && destination
        ? getComputedStyle(destination).backgroundColor
        : finalBackground,
    );
    const start = expanding
      ? sourceBox!
      : new DOMRect(0, -priorScroll, innerWidth, innerHeight);
    const end = shrinking
      ? targetBox!
      : new DOMRect(0, 0, innerWidth, innerHeight);
    const waveHeight = expanding
      ? targetWaveBox?.height || innerHeight * 0.7
      : oldWaveBox?.height || innerHeight * 0.7;
    const waveTop = expanding
      ? targetWaveBox?.top || 0
      : (oldWaveBox?.top || 0) + priorScroll;
    const hide = (el: HTMLElement | null) => {
      if (el) {
        hidden.push(el);
        el.style.visibility = "hidden";
      }
    };
    if (expanding || shrinking) {
      surface = document.createElement("div");
      surface.className = "writing-transition-surface";
      surface.style.cssText =
        "position:fixed;z-index:200;overflow:hidden;pointer-events:none;opacity:1;";
      surface.setAttribute("aria-hidden", "true");
      if (shrinking)
        shapeMotion = morphArtwork(
          oldArt!,
          cardArtwork.get(event.from.pathname) || oldArt!,
        );
      svg =
        shapeMotion?.svg ||
        ((expanding ? cardArt! : oldArt!).cloneNode(true) as SVGSVGElement);
      svg.style.cssText = "position:absolute;width:100%;display:block;";
      surface.appendChild(svg);
      document.body.appendChild(surface);
      overlays.push(surface);
      const from = expanding ? sourceText : headerText;
      const to = captureText(
        expanding ? document.querySelector(headerSelector) : destination,
        shrinking,
      );
      from.forEach((a, index) => {
        const b = to[index];
        if (!a || !b) return;
        const el = document.createElement("div");
        el.textContent = a.text;
        el.setAttribute("aria-hidden", "true");
        el.className = "writing-transition-word";
        el.style.cssText = `position:fixed;z-index:300;pointer-events:none;margin:0;padding:0;font-family:${a.font};font-weight:${a.weight};color:${a.color};letter-spacing:${a.spacing};`;
        document.body.appendChild(el);
        overlays.push(el);
        words.push({ el, from: a, to: b, index });
      });
      if (expanding) {
        document
          .querySelectorAll<HTMLElement>(
            `${headerSelector} h1,${headerSelector} .summary,${headerSelector} time`,
          )
          .forEach(hide);
        hide(targetWaves);
        main.style.zIndex = "210";
        main.style.position = "relative";
      } else hide(destination || null);
    } else if (oldArt && oldWaveBox) {
      surface = document.createElement("div");
      surface.setAttribute("aria-hidden", "true");
      surface.style.cssText = `position:fixed;left:${oldWaveBox.x}px;top:${oldWaveBox.y}px;width:${oldWaveBox.width}px;height:${oldWaveBox.height}px;z-index:0;pointer-events:none;`;
      surface.appendChild(oldArt);
      document.body.appendChild(surface);
      overlays.push(surface);
    }
    if (nav) {
      nav.style.position = "relative";
      nav.style.zIndex = "400";
    }
    let frame = 0,
      done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      overlays.forEach((el) => el.remove());
      hidden.forEach((el) => el.style.removeProperty("visibility"));
      main.style.removeProperty("opacity");
      main.style.removeProperty("position");
      main.style.removeProperty("z-index");
      nav?.style.removeProperty("position");
      nav?.style.removeProperty("z-index");
      document.documentElement.removeAttribute("data-writing-transition");
      document.dispatchEvent(new Event("writing:transition-end"));
      const focus = shrinking
        ? destination
        : document.querySelector<HTMLElement>("main h1");
      if (focus) {
        focus.tabIndex = focus.tagName === "H1" ? -1 : 0;
        focus.focus({ preventScroll: true });
      }
    };
    dispose = finish;
    const started = performance.now();
    document.documentElement.dataset.writingTransition = expanding
      ? "expand"
      : shrinking
        ? "collapse"
        : "exit";
    function draw(now: number) {
      const q = clamp((now - started) / DURATION),
        e = smooth(q);
      ghost.style.opacity = String(1 - smooth(q / 0.42));
      // The list is already in its final state underneath a returning card.
      // Shrinking the opaque surface reveals it; no second reveal is needed.
      main.style.opacity = shrinking
        ? "1"
        : String(
            smooth((q - (expanding ? 0.45 : 0.18)) / (expanding ? 0.35 : 0.65)),
          );
      if ((expanding || shrinking) && surface && svg) {
        shapeMotion?.draw(e);
        const a = shrinking ? 1 - e : e;
        Object.assign(surface.style, {
          left: mix(start.x, end.x, e) + "px",
          top: mix(start.y, end.y, e) + "px",
          width: mix(start.width, end.width, e) + "px",
          height: mix(start.height, end.height, e) + "px",
          borderRadius: mix(shrinking ? 0 : 16, shrinking ? 16 : 0, e) + "px",
          backgroundColor: `rgb(${startRGB.map((v, i) => mix(v, endRGB[i], e)).join(" ")})`,
        });
        svg.style.top = mix(0, waveTop, a) + "px";
        svg.style.height =
          mix(
            expanding ? sourceBox!.height : targetBox!.height,
            waveHeight,
            a,
          ) + "px";
        svg.style.opacity = String(mix(1, 0.75, a));
        words.forEach(({ el, from: a, to: b, index }) =>
          Object.assign(el.style, {
            left: mix(a.box.x, b.box.x, e) + "px",
            top:
              mix(a.box.y, b.box.y, e) -
              (index === 2 ? Math.sin(Math.PI * e) * 70 : 0) +
              "px",
            width: mix(a.box.width, b.box.width, e) + "px",
            fontSize: mix(a.size, b.size, e) + "px",
            lineHeight: mix(a.line, b.line, e) + "px",
          }),
        );
      } else if (surface && oldWaveBox)
        surface.style.transform = `translateY(${-(oldWaveBox.height + Math.max(0, oldWaveBox.top) + 40) * e}px)`;
      if (q < 1) frame = requestAnimationFrame(draw);
      else finish();
    }
    draw(started);
  };
}

document.addEventListener("astro:before-preparation", () => {
  dispose();
  pending = undefined;
});
document.addEventListener("astro:before-swap", (raw) => {
  const event = raw as TransitionBeforeSwapEvent;
  const theme = document.documentElement.dataset.theme || "light";
  event.newDocument.documentElement.dataset.theme = theme;
  event.newDocument.documentElement.dataset.navigationSettled = "";
  void event.viewTransition.ready.catch(() => {});
  event.viewTransition.skipTransition();
  if (
    theme === "dark" &&
    !reduced.matches &&
    (document.querySelector(articleSelector) ||
      event.newDocument.querySelector(articleSelector))
  )
    motion(event);
});
document.addEventListener("astro:after-swap", () => {
  refreshSharedCurrents();
  syncTheme();
  const run = pending;
  pending = undefined;
  run?.();
});
document.addEventListener("astro:page-load", () => {
  applyArt();
  syncTheme();
  document.querySelectorAll<HTMLAnchorElement>(".nav-link").forEach((link) => {
    const active =
      location.pathname === link.pathname ||
      location.pathname.startsWith(link.pathname + "/");
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
});
let observedTheme = document.documentElement.dataset.theme;
new MutationObserver(() => {
  const next = document.documentElement.dataset.theme;
  if (next === observedTheme) return;
  observedTheme = next;
  dispose();
  applyArt();
  syncTheme();
}).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-theme"],
});
reduced.addEventListener("change", () => dispose());
window.addEventListener("resize", () => dispose());
window.addEventListener("pagehide", () => dispose());
applyArt();
syncTheme();
