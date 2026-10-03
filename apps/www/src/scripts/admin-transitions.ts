/** Public presentation only. Authentication starts at the explicit continue link. */
import {
  navigate,
  type TransitionBeforePreparationEvent,
  type TransitionBeforeSwapEvent,
} from "astro:transitions/client";
import {
  savedTheme,
  saveTheme,
  resolvedTheme,
  themedUrl,
} from "@anipotts/brand/theme";
import { captureGhost, prepareGhostSheets, type Ghost } from "./writing-ghost";
import {
  duration,
  reducedDuration,
  sampleIdentity,
  sampleSurface,
  surfacePath,
  mix,
  type IdentityGeometry,
  type SurfaceGeometry,
  type Rect,
  type CornerRadii,
  type Direction,
} from "../lib/admin-motion";

const reduced = matchMedia("(prefers-reduced-motion: reduce)");
type Scope = Pick<ParentNode, "querySelector" | "querySelectorAll">;
const $ = <T extends Element = HTMLElement>(
  selector: string,
  root: Scope = document,
) => root.querySelector<T>(selector);
const all = (selector: string, root: Scope = document) => [
  ...root.querySelectorAll<HTMLElement>(selector),
];
const rect = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};
const radii = (el: Element): CornerRadii => {
  const s = getComputedStyle(el);
  return [
    s.borderTopLeftRadius,
    s.borderTopRightRadius,
    s.borderBottomRightRadius,
    s.borderBottomLeftRadius,
  ].map(parseFloat) as [number, number, number, number];
};
const svgNS = "http://www.w3.org/2000/svg";
const svg = (tag: string, attrs: Record<string, string> = {}) => {
  const el = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
};
const alpha = (el: Element | null, value: number) => {
  if (el instanceof HTMLElement || el instanceof SVGElement)
    el.style.opacity = String(value);
};
const transform = (el: Element, value: string) =>
  el.setAttribute("transform", value);
const blend = (a: string, b: string, t: number) => {
  const rgb = (color: string) =>
    color.startsWith("#")
      ? color
          .slice(1)
          .match(/../g)!
          .map((v) => parseInt(v, 16))
      : color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
  const from = rgb(a),
    to = rgb(b);
  return `rgb(${from.map((v, i) => mix(v, to[i], t)).join(",")})`;
};
const reveal = (el: HTMLElement, value: number, distance = 6) => {
  alpha(el, value);
  el.style.transform =
    value === 1 ? "none" : `translateY(${distance * (1 - value)}px)`;
};
const anchor = (el: Element) => {
  const r = el.getBoundingClientRect();
  return {
    x: r.left + r.width / 2,
    y: r.top + (r.height - r.width) / 2 + r.width * 0.4238955078,
    scale: (r.width * 0.68965517) / 204.8,
  };
};

type PublicScene = {
  ghost: Ghost;
  scope: Scope;
  header: ReturnType<typeof anchor>;
  footer: ReturnType<typeof anchor>;
  card: Rect;
  radii: CornerRadii;
  paper: string;
  ground: string;
  ink: string;
  a: string;
  p: string;
};
type AdminScene = {
  ghost: Ghost;
  scope: Scope;
  identity: Omit<IdentityGeometry, "header" | "footer">;
  left: number;
  right: number;
  main: Rect;
  radii: CornerRadii;
  paper: string;
  rail: string;
  ink: string;
};
type Intent = {
  direction: Direction;
  to: string;
  width: number;
  height: number;
  outgoing?: PublicScene | AdminScene;
};
let intent: Intent | undefined;
let finish: (() => void) | undefined;
let returnTo = "/";
const owned = new Set<Element>();
const own = <T extends Element>(el: T): T => {
  owned.add(el);
  return el;
};
const scopeOf = (ghost: Ghost) => ghost.layer.shadowRoot || ghost.layer;
function syncEntryTheme() {
  all("[data-admin-action]").forEach((link) => {
    link.setAttribute(
      "href",
      themedUrl(link.getAttribute("href")!, savedTheme()),
    );
  });
  all("[data-admin-theme]").forEach((button) =>
    button.setAttribute(
      "aria-pressed",
      String(document.documentElement.dataset.theme === "dark"),
    ),
  );
}
const pageGhost = () => {
  const ghost = captureGhost($<HTMLElement>("body > main")!, []);
  own(ghost.host);
  return ghost;
};

function publicScene(): PublicScene {
  const header = $("[data-admin-header-logo] svg")!;
  const footer = $("[data-admin-footer-logo] svg")!;
  const candidates = all(
    ".work-card, .writing-card, .experience-feature, .coding-agent-card, .press-mention, .editorial-card-preview",
  );
  const visible = candidates
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(
      ({ r }) => r.bottom > 24 && r.top < innerHeight - 40 && r.width > 160,
    );
  // The visible paper nearest the footer expands. On return use the first card
  // in the opening viewport; neither choice changes the real page's scroll.
  visible.sort((a, b) =>
    intent?.direction === 1 ? b.r.bottom - a.r.bottom : a.r.top - b.r.top,
  );
  const paper = visible[0]?.el;
  paper?.setAttribute("data-admin-motion-paper", "");
  const ghost = pageGhost();
  paper?.removeAttribute("data-admin-motion-paper");
  const scope = scopeOf(ghost);
  const card = paper
    ? rect(paper)
    : {
        left: 24,
        top: Math.max(80, innerHeight * 0.22),
        right: innerWidth - 24,
        bottom: Math.max(160, innerHeight * 0.72),
      };
  const ground = getComputedStyle(document.documentElement).backgroundColor;
  return {
    ghost,
    scope,
    header: anchor(header),
    footer: anchor(footer),
    card,
    radii: paper ? radii(paper) : [12, 12, 12, 12],
    paper: paper ? getComputedStyle(paper).backgroundColor : ground,
    ground,
    ink: getComputedStyle(header).color,
    a: $<SVGPathElement>(".brand-mark__half--left path", header)!.getAttribute(
      "d",
    )!,
    p: $<SVGPathElement>(".brand-mark__half--right path", header)!.getAttribute(
      "d",
    )!,
  };
}
function adminScene(): AdminScene {
  const letters = $("[data-admin-letters]")!;
  const text = letters.firstChild!;
  const canvas = document.createElement("canvas").getContext("2d")!;
  canvas.font = '900 20px "AP Structural"';
  const glyphLeft = (ch: string) =>
    -canvas.measureText(ch).actualBoundingBoxLeft;
  const boxes = [..."admin"].map((_, i) => {
    const range = new Range();
    range.setStart(text, i);
    range.setEnd(text, i + 1);
    return range.getBoundingClientRect();
  });
  const origin = boxes[0].left + glyphLeft("a");
  const scale = 0.1;
  const identity = {
    origin,
    baseline: $("[data-admin-baseline]")!.getBoundingClientRect().top,
    targetLetters: boxes.map(
      (r, i) =>
        (r.left + (i < 2 ? glyphLeft("admin"[i]) : 12 * scale) - origin) /
        scale,
    ),
  };
  const left =
    ($("[data-admin-left]")!.getBoundingClientRect().left +
      glyphLeft("[") -
      origin) /
    scale;
  const right =
    ($("[data-admin-right]")!.getBoundingClientRect().left +
      glyphLeft("]") -
      origin) /
    scale;
  const main = $("[data-admin-main-surface]")!;
  const style = getComputedStyle($("[data-admin-entry]")!);
  const ghost = pageGhost();
  return {
    ghost,
    scope: scopeOf(ghost),
    identity,
    left,
    right,
    main: rect(main),
    radii: radii(main),
    paper: style.getPropertyValue("--entry-bg").trim(),
    rail: style.getPropertyValue("--entry-rail").trim(),
    ink: style.color,
  };
}

function run(
  publicView: PublicScene,
  adminView: AdminScene,
  direction: Direction,
) {
  const geometry: IdentityGeometry = {
    header: publicView.header,
    footer: publicView.footer,
    ...adminView.identity,
  };
  const surface: SurfaceGeometry = {
    card: publicView.card,
    main: adminView.main,
    cardRadii: publicView.radii,
    mainRadii: adminView.radii,
  };
  const backdrop = own(document.createElement("div"));
  backdrop.setAttribute("data-admin-motion-overlay", "");
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.inert = true;
  backdrop.style.cssText =
    "position:fixed;inset:0;z-index:1000;overflow:hidden;pointer-events:none;contain:strict;";
  const plane = svg("svg", {
    viewBox: `0 0 ${innerWidth} ${innerHeight}`,
    width: "100%",
    height: "100%",
  });
  plane.style.cssText = "position:absolute;inset:0;overflow:visible";
  const rail = svg("rect", {
    width: String(innerWidth),
    height: String(innerHeight),
    fill: adminView.rail,
  });
  const paper = svg("path");
  plane.appendChild(rail);
  plane.appendChild(paper);
  backdrop.appendChild(plane);
  document.documentElement.appendChild(backdrop);
  publicView.ghost.show(null, 1001);
  adminView.ghost.show(null, 1002);
  const canvas = own(
    svg("svg", { viewBox: `0 0 ${innerWidth} ${innerHeight}` }),
  );
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:1003;pointer-events:none;overflow:visible";
  canvas.setAttribute("aria-hidden", "true");
  const word = svg("g");
  canvas.appendChild(word);
  const a = svg("g"),
    p = svg("g"),
    spin = svg("g");
  a.appendChild(
    svg("path", {
      d: publicView.a,
      transform: "translate(0,100) scale(.1,-.1) translate(-60,0)",
    }),
  );
  spin.appendChild(
    svg("path", {
      d: publicView.p,
      transform: "translate(0,100) scale(.1,-.1) translate(-120,0)",
    }),
  );
  p.appendChild(spin);
  word.appendChild(a);
  word.appendChild(p);
  const letters = ["m", "i", "n"].map((ch) => {
    const group = svg("g"),
      text = svg("text", { x: "-12", y: "100" });
    text.textContent = ch;
    text.style.cssText = 'font:900 200px "AP Structural";letter-spacing:normal';
    group.appendChild(text);
    word.appendChild(group);
    return group;
  });
  const brackets = ["[", "]"].map((ch) => {
    const group = svg("g"),
      text = svg("text", { x: ch === "[" ? "-12" : "-10", y: "100" });
    text.textContent = ch;
    text.style.cssText =
      'font:900 200px "AP Structural";letter-spacing:normal;fill:#61abea';
    group.appendChild(text);
    word.appendChild(group);
    return group;
  });
  word.style.fill = "currentColor";
  document.documentElement.appendChild(canvas);
  const www = publicView.scope,
    admin = adminView.scope;
  const main = $<HTMLElement>("main", www)!;
  const card = $<HTMLElement>("[data-admin-motion-paper]", www);
  if (card && !reduced.matches) {
    card.style.background = "transparent";
    card.style.boxShadow = "none";
  }
  const nav = $<HTMLElement>("header.nav", www),
    foot = $<HTMLElement>("footer.foot", www);
  const wave = $<HTMLElement>(".page-current", www);
  const waveOpacity = wave ? parseFloat(getComputedStyle(wave).opacity) : 0;
  // Keep the original currents behind the paper, as on the real page.
  const paperScope =
    publicView.ghost.layer.shadowRoot || publicView.ghost.layer;
  paperScope.appendChild(plane);
  plane.style.zIndex = "1";
  [main, nav, foot].forEach((el) => {
    if (el) el.style.zIndex = "2";
  });
  const native = $("[data-admin-wordmark]", admin);
  const publicHeader = $("[data-admin-header-logo] svg", www),
    publicFooter = $("[data-admin-footer-logo] svg", www);
  all("[data-admin-rail], [data-admin-main-surface]", admin).forEach((el) =>
    alpha(el, 0),
  );
  // A hidden persisted public header still belongs to the admin capture.
  alpha($("header.nav", admin), 0);
  let frame = 0;
  const body = document.body;
  const oldVisibility = body.style.visibility,
    oldInert = body.inert;
  body.style.visibility = "hidden";
  body.inert = true;
  const cancelScroll = (event: Event) => event.preventDefault();
  document.addEventListener("wheel", cancelScroll, { passive: false });
  document.addEventListener("touchmove", cancelScroll, { passive: false });
  let done = false;
  finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    publicView.ghost.host.remove();
    adminView.ghost.host.remove();
    backdrop.remove();
    canvas.remove();
    owned.clear();
    body.style.visibility = oldVisibility;
    body.inert = oldInert;
    delete document.documentElement.dataset.adminMotion;
    document.removeEventListener("wheel", cancelScroll);
    document.removeEventListener("touchmove", cancelScroll);
    finish = undefined;
    const focus = $<HTMLElement>(
      direction === 1 ? "[data-admin-heading]" : "[data-admin-header-logo]",
    );
    focus?.focus({ preventScroll: true });
    document.dispatchEvent(new Event("admin:transition-end"));
  };
  const render = (progress: number) => {
    const t = direction === 1 ? progress : 1 - progress;
    backdrop.dataset.progress = t.toFixed(4);
    if (reduced.matches) {
      plane.style.display = "none";
      backdrop.style.background = blend(publicView.ground, adminView.paper, t);
      alpha(publicView.ghost.host, 1 - t);
      alpha(adminView.ghost.host, t);
      alpha(canvas, 0);
      all("[data-admin-rail], [data-admin-main-surface]", admin).forEach((el) =>
        alpha(el, 1),
      );
      return;
    }
    const f = sampleSurface(t, surface),
      logo = sampleIdentity(t, geometry, direction);
    backdrop.style.background = blend(
      publicView.ground,
      adminView.paper,
      f.field,
    );
    paper.setAttribute("d", surfacePath(f.rect, f.radii));
    paper.setAttribute(
      "fill",
      blend(publicView.paper, adminView.paper, f.field),
    );
    alpha(rail, f.rail);
    reveal(main, f.editorial, -9);
    if (nav) reveal(nav, f.nav, -7);
    if (foot) reveal(foot, f.footer, 7);
    alpha(wave, waveOpacity * f.wave);
    if (card) {
      const r = f.rect,
        s = surface.card;
      card.style.clipPath = `inset(${Math.max(0, r.top - s.top)}px ${Math.max(0, s.right - r.right)}px ${Math.max(0, s.bottom - r.bottom)}px ${Math.max(0, r.left - s.left)}px)`;
    }
    for (const [hook, value, travel] of [
      ["nav", f.sidebar, 0],
      ["search", f.controls, 0],
      ["controls", f.controls, 0],
      ["heading", f.heading, 6],
      ["body", f.body, 6],
      ["action", f.action, 4],
      ["account", f.account, 4],
    ] as const)
      all(`[data-admin-${hook}]`, admin).forEach((el) =>
        reveal(el, value, travel),
      );
    transform(
      word,
      `translate(${logo.pose.x},${logo.pose.y}) scale(${logo.pose.scale})`,
    );
    transform(a, `translate(${geometry.targetLetters[0]},0)`);
    transform(p, `translate(${logo.pX},0)`);
    transform(spin, `rotate(${-180 * logo.rotation},53.9,50)`);
    letters.forEach((el, i) => {
      transform(
        el,
        `translate(${geometry.targetLetters[i + 2]},${10 * (1 - logo.min[i])})`,
      );
      alpha(el, logo.min[i]);
    });
    brackets.forEach((el, i) => {
      transform(
        el,
        `translate(${(i === 0 ? adminView.left : adminView.right) + (i === 0 ? -12 : 12) * (1 - logo.bracket)},0)`,
      );
      alpha(el, logo.bracket);
    });
    word.style.color = blend(publicView.ink, adminView.ink, logo.ink);
    alpha(word, logo.word);
    alpha(native, logo.native);
    alpha(publicHeader, logo.header);
    alpha(publicFooter, logo.footer);
  };
  const started = performance.now();
  const length = reduced.matches ? reducedDuration : duration;
  render(0);
  const tick = (now: number) => {
    // A callback registered during a frame can receive that frame's earlier
    // timestamp. Keep the first reduced-motion blend inside its color range.
    const progress = Math.max(0, Math.min(1, (now - started) / length));
    render(progress);
    if (progress < 1) frame = requestAnimationFrame(tick);
    else finish?.();
  };
  frame = requestAnimationFrame(tick);
}

function cleanup() {
  finish?.();
  intent?.outgoing?.ghost.host.remove();
  owned.forEach((el) => el.remove());
  owned.clear();
  intent = undefined;
  document.body.style.removeProperty("visibility");
  delete document.documentElement.dataset.adminMotion;
}
// The router's normal history, loading, failure and focus behavior remains the
// fallback. Only explicit, unmodified entry/return clicks request this motion.
document.addEventListener(
  "click",
  (event) => {
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>(
            "[data-admin-enter], [data-admin-return]",
          )
        : null;
    if (
      !target ||
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      target.target === "_blank"
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    if (finish) return;
    const direction: Direction = target.hasAttribute("data-admin-enter")
      ? 1
      : -1;
    if (direction === 1) returnTo = location.pathname + location.search;
    const destination = themedUrl(
      direction === 1 ? "/admin" : returnTo,
      savedTheme(),
    );
    cleanup();
    intent = {
      direction,
      to: new URL(destination, location.href).pathname,
      width: innerWidth,
      height: innerHeight,
    };
    const navigation = intent;
    void navigate(destination, { sourceElement: target }).catch(() => {
      if (intent !== navigation) return;
      cleanup();
      location.assign(destination);
    });
  },
  true,
);

document.addEventListener("astro:before-preparation", (raw) => {
  const event = raw as TransitionBeforePreparationEvent;
  if (!intent || event.to.pathname !== intent.to) {
    cleanup();
    return;
  }
  const active = intent;
  const loader = event.loader;
  event.loader = async () => {
    await Promise.all([
      loader(),
      document.fonts.load('900 20px "AP Structural"'),
    ]);
  };
  event.signal.addEventListener(
    "abort",
    () => {
      if (intent === active) cleanup();
    },
    { once: true },
  );
});
document.addEventListener("astro:before-swap", (raw) => {
  const event = raw as TransitionBeforeSwapEvent;
  if (!intent || event.to.pathname !== intent.to) return;
  if (
    intent.width !== innerWidth ||
    intent.height !== innerHeight ||
    document.hidden
  ) {
    cleanup();
    return;
  }
  try {
    intent.outgoing = intent.direction === 1 ? publicScene() : adminScene();
  } catch {
    cleanup();
    return;
  }
  event.viewTransition.skipTransition();
  event.newDocument.documentElement.dataset.adminMotion = "true";
  event.newDocument.body.style.visibility = "hidden";
});
document.addEventListener("astro:page-load", () => {
  syncEntryTheme();
  all("[data-admin-return]").forEach((el) => el.setAttribute("href", returnTo));
  const current = intent;
  if (!current?.outgoing) {
    prepareGhostSheets();
    return;
  }
  intent = undefined;
  // Return always presents the header, independent of the footer's old scroll.
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  // Finish rise effects before measuring so the destination's native handoff is exact.
  all("[data-rise]").forEach((el) => {
    el.style.animation = "none";
    el.style.opacity = "1";
    el.style.transform = "none";
  });
  document.body.style.removeProperty("visibility");
  try {
    const incoming = current.direction === 1 ? adminScene() : publicScene();
    run(
      (current.direction === 1 ? current.outgoing : incoming) as PublicScene,
      (current.direction === 1 ? incoming : current.outgoing) as AdminScene,
      current.direction,
    );
  } catch (error) {
    current.outgoing.ghost.host.remove();
    cleanup();
    console.error("Admin presentation transition failed", error);
  }
});
document.addEventListener("click", (event) => {
  if (
    !(event.target instanceof Element) ||
    !event.target.closest("[data-admin-theme]")
  )
    return;
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  saveTheme(next);
  document.documentElement.dataset.theme = resolvedTheme(next);
  syncEntryTheme();
});
window.addEventListener("resize", () => {
  if (finish) finish();
});
window.addEventListener("pagehide", cleanup);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) finish?.();
});
reduced.addEventListener("change", () => finish?.());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") finish?.();
});
