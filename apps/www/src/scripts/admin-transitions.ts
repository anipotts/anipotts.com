/** Public presentation only. Authentication starts at the explicit continue link. */
import "./admin-entry.ts";
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
  compactDuration,
  motionLayout,
  reducedDuration,
  sampleIdentity,
  sampleSurface,
  surfacePath,
  surfaceInsetEdge,
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
// Canvas resolves computed color-mix()/rgba values to sRGB once per color.
const colors = new Map<string, number[]>();
const rgba = (color: string) => {
  let value = colors.get(color);
  if (!value) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    context.fillStyle = color;
    context.fillRect(0, 0, 1, 1);
    const pixel = context.getImageData(0, 0, 1, 1).data;
    value = [pixel[0], pixel[1], pixel[2], pixel[3] / 255];
    colors.set(color, value);
  }
  return value;
};
const blend = (a: string, b: string, t: number) => {
  const from = rgba(a),
    to = rgba(b);
  return `rgba(${from.map((v, i) => mix(v, to[i], t)).join(",")})`;
};
const opaque = (color: string, background: string) => {
  const front = rgba(color),
    back = rgba(background);
  return `rgb(${front
    .slice(0, 3)
    .map((v, i) => mix(back[i], v, front[3]))
    .join(",")})`;
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
  button: Rect;
  buttonRadii: CornerRadii;
  buttonFill: string;
  buttonBorder: string;
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
  border: string;
  ink: string;
};
type Intent = {
  direction: Direction;
  to: string;
  width: number;
  height: number;
  outgoing?: PublicScene | AdminScene;
  stage?: HTMLDivElement;
};
let intent: Intent | undefined;
let finish: (() => void) | undefined;
const returnTo = "/";
const owned = new Set<Element>();
const own = <T extends Element>(el: T): T => {
  owned.add(el);
  return el;
};
const scopeOf = (ghost: Ghost) => ghost.layer.shadowRoot || ghost.layer;
function syncEntryTheme() {
  // Consume an incoming theme once on either page. Leaving it on the public
  // return URL would override the user's next theme toggle when entering again.
  const theme = savedTheme();
  all("[data-admin-action]").forEach((link) => {
    link.setAttribute("href", themedUrl(link.getAttribute("href")!, theme));
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

class NoMotionSurface extends Error {}

function publicScene(direction: Direction): PublicScene {
  const header = $("[data-admin-header-logo] svg")!;
  const footer = $("[data-admin-footer-logo] svg")!;
  const mainWidth = $("body > main")!.getBoundingClientRect().width;
  const candidates = all(
    ".work-card, .writing-card, .experience-feature, .coding-agent-card, .press-mention, .editorial-card-preview",
  ).filter((el) => $(".site-action", el));
  const visible = candidates
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(
      ({ r }) =>
        r.bottom > 24 &&
        r.top < innerHeight - 40 &&
        r.width >= mainWidth * 0.85,
    );
  visible.sort((a, b) =>
    direction === 1 ? b.r.bottom - a.r.bottom : a.r.top - b.r.top,
  );
  const preferred =
    location.pathname === "/"
      ? visible.find(({ el }) =>
          el.matches(direction === 1 ? ".coding-agent-card" : ".press-mention"),
        )
      : undefined;
  const paper = (preferred || visible[0])?.el;
  // A missing real nested pair uses the router's ordinary fallback. Never
  // manufacture a rectangle or change another page's composition to animate it.
  if (!paper)
    throw new NoMotionSurface("No visible full-row card with an action");
  const button =
    $("[data-admin-motion-action]", paper) || $(".site-action", paper)!;
  paper.setAttribute("data-admin-motion-paper", "");
  button.setAttribute("data-admin-motion-button", "");
  let ghost: Ghost;
  try {
    ghost = pageGhost();
  } finally {
    paper.removeAttribute("data-admin-motion-paper");
    button.removeAttribute("data-admin-motion-button");
  }
  const scope = scopeOf(ghost);
  const card = rect(paper);
  const paperColor = getComputedStyle(paper).backgroundColor;
  const buttonStyle = getComputedStyle(button);
  const ground = getComputedStyle(document.documentElement).backgroundColor;
  return {
    ghost,
    scope,
    header: anchor(header),
    footer: anchor(footer),
    card,
    radii: radii(paper),
    button: rect(button),
    buttonRadii: radii(button),
    buttonFill: opaque(buttonStyle.backgroundColor, paperColor),
    buttonBorder: buttonStyle.borderTopColor,
    paper: opaque(paperColor, ground),
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
  // A collapsed rail has no visible identity to morph. Keep native navigation
  // rather than measuring hidden text as an identity at the viewport origin.
  if ($<HTMLElement>("[data-admin-entry]")?.dataset.sidebarCollapsed === "true")
    throw new NoMotionSurface();
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
    border: getComputedStyle(main).borderTopColor,
    ink: style.color,
  };
}

function run(
  publicView: PublicScene,
  adminView: AdminScene,
  direction: Direction,
  backdrop: HTMLDivElement,
) {
  const layout = motionLayout(innerWidth);
  const geometry: IdentityGeometry = {
    layout,
    header: publicView.header,
    footer: publicView.footer,
    ...adminView.identity,
  };
  const surface: SurfaceGeometry = {
    layout,
    card: publicView.card,
    button: publicView.button,
    viewport: { left: 0, top: 0, right: innerWidth, bottom: innerHeight },
    buttonRadii: publicView.buttonRadii,
    main: adminView.main,
    cardRadii: publicView.radii,
    mainRadii: adminView.radii,
  };
  backdrop.dataset.phase = "animating";
  const plane = svg("svg", {
    viewBox: `0 0 ${innerWidth} ${innerHeight}`,
    width: "100%",
    height: "100%",
  });
  plane.style.cssText = "position:absolute;inset:0;overflow:visible";
  const outer = svg("path", { "data-motion-outer": "" });
  const clip = svg("clipPath", { id: "admin-surface-clip" });
  const clipShape = svg("path");
  clip.appendChild(clipShape);
  const defs = svg("defs");
  defs.appendChild(clip);
  const paper = svg("path", {
    "data-motion-panel": "",
    "stroke-width": "1",
    "clip-path": "url(#admin-surface-clip)",
  });
  const outline = svg("path", {
    fill: "none",
    "stroke-width": "1",
    "clip-path": "url(#admin-surface-clip)",
  });
  const insetEdge = svg("path", {
    fill: "none",
    "stroke-width": "1",
    "clip-path": "url(#admin-surface-clip)",
  });
  plane.appendChild(defs);
  plane.appendChild(outer);
  plane.appendChild(paper);
  plane.appendChild(outline);
  plane.appendChild(insetEdge);
  backdrop.appendChild(plane);
  backdrop.appendChild(publicView.ghost.host);
  backdrop.appendChild(adminView.ghost.host);
  publicView.ghost.show(null, 1);
  adminView.ghost.show(null, 2);
  const canvas = own(
    svg("svg", { viewBox: `0 0 ${innerWidth} ${innerHeight}` }),
  );
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;overflow:visible";
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
  backdrop.appendChild(canvas);
  const www = publicView.scope,
    admin = adminView.scope;
  const main = $<HTMLElement>("main", www)!;
  let card = $<HTMLElement>("[data-admin-motion-paper]", www);
  const button = $<HTMLElement>("[data-admin-motion-button]", www);
  if (button && !reduced.matches) {
    button.style.background = "transparent";
    button.style.borderColor = "transparent";
    button.style.boxShadow = "none";
  }
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
  if (layout === "compact" && card) {
    // Let the incoming page emerge from behind the opaque paper. Lift just
    // its source card's content above it so the nested-card identity remains
    // visible without letting unrelated prose paint through the workspace.
    main.style.zIndex = "0";
    const lifted = card.cloneNode(true) as HTMLElement;
    const r = surface.card;
    Object.assign(lifted.style, {
      position: "fixed",
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.right - r.left}px`,
      height: `${r.bottom - r.top}px`,
      margin: "0",
      boxSizing: "border-box",
      transform: "none",
      zIndex: "2",
      pointerEvents: "none",
    });
    alpha(card, 0);
    paperScope.appendChild(lifted);
    card = lifted;
  }
  const native = $("[data-admin-wordmark]", admin);
  const adminShell = $<HTMLElement>("[data-admin-entry]", admin)!;
  const adminMain = $<HTMLElement>("[data-admin-main]", admin)!;
  const publicHeader = $("[data-admin-header-logo] svg", www),
    publicFooter = $("[data-admin-footer-logo] svg", www);
  all("[data-admin-rail], [data-admin-main-surface]", admin).forEach((el) =>
    alpha(el, 0),
  );
  // A hidden persisted public header still belongs to the admin capture.
  alpha($("header.nav", admin), 0);
  let frame = 0;
  const body = document.body;
  const oldInert = body.inert;
  body.style.visibility = "hidden";
  body.inert = true;

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
    body.style.removeProperty("visibility");
    body.inert = oldInert;
    delete document.documentElement.dataset.adminMotion;
    document.removeEventListener("wheel", blockScroll);
    document.removeEventListener("touchmove", blockScroll);
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
    const f = sampleSurface(t, surface, direction),
      logo = sampleIdentity(t, geometry, direction);
    // Public blue is never color-tweened. Opaque card geometry covers it.
    backdrop.style.background = publicView.ground;
    const outerPath = surfacePath(f.rect, f.radii);
    if (layout === "compact") {
      // Text stays at native size, revealed only inside the moving surfaces.
      // Earlier content can overlap the expansion without floating over blue.
      adminShell.style.clipPath = `path('${outerPath}')`;
      const target = surface.main;
      adminMain.style.clipPath = `inset(${Math.max(0, f.panel.top - target.top)}px ${Math.max(0, target.right - f.panel.right)}px ${Math.max(0, target.bottom - f.panel.bottom)}px ${Math.max(0, f.panel.left - target.left)}px)`;
    }
    outer.setAttribute("d", outerPath);
    clipShape.setAttribute("d", outerPath);
    outer.setAttribute(
      "fill",
      blend(publicView.paper, adminView.rail, f.expansion),
    );
    // SVG strokes straddle their path; inset by half a pixel to match CSS's
    // inside border without shifting the measured button/panel outer bounds.
    const panel = {
      left: f.panel.left + 0.5,
      top: f.panel.top + 0.5,
      right: f.panel.right - 0.5,
      bottom: f.panel.bottom - 0.5,
    };
    const panelRadii = f.panelRadii.map((r) => Math.max(0, r - 0.5)) as [
      number,
      number,
      number,
      number,
    ];
    paper.setAttribute("d", surfacePath(f.panel, f.panelRadii));
    paper.setAttribute(
      "fill",
      blend(publicView.buttonFill, adminView.paper, f.panelExpansion),
    );
    outline.setAttribute("d", surfacePath(panel, panelRadii));
    insetEdge.setAttribute("d", surfaceInsetEdge(panel, panelRadii));
    const borderColor = blend(
      publicView.buttonBorder,
      adminView.border,
      f.panelExpansion,
    );
    outline.setAttribute("stroke", borderColor);
    insetEdge.setAttribute("stroke", borderColor);
    alpha(outline, 1 - f.panelExpansion);
    alpha(insetEdge, f.panelExpansion);
    reveal(main, f.editorial, -9);
    if (nav) reveal(nav, f.nav, -7);
    if (foot) reveal(foot, f.footer, 7);
    alpha(wave, waveOpacity * f.wave);
    if (card) {
      if (layout === "compact") alpha(card, f.editorial);
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
  const length = reduced.matches
    ? reducedDuration
    : layout === "compact"
      ? compactDuration
      : duration;
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

const blockScroll = (event: Event) => event.preventDefault();

function holdScene(current: Intent) {
  const source = current.outgoing!;
  const stage = own(document.createElement("div"));
  stage.setAttribute("data-admin-motion-overlay", "");
  stage.dataset.phase = "preparing";
  stage.setAttribute("aria-hidden", "true");
  stage.inert = true;
  stage.style.cssText =
    "position:fixed;inset:0;z-index:1000;overflow:hidden;pointer-events:none;contain:strict;";
  stage.style.background =
    current.direction === 1
      ? (source as PublicScene).ground
      : (source as AdminScene).rail;
  document.documentElement.appendChild(stage);
  stage.appendChild(source.ghost.host);
  source.ghost.show(null, 1);
  current.stage = stage;
  document.addEventListener("wheel", blockScroll, { passive: false });
  document.addEventListener("touchmove", blockScroll, { passive: false });
}

function cleanup() {
  finish?.();
  intent?.outgoing?.ghost.host.remove();
  owned.forEach((el) => el.remove());
  owned.clear();
  intent = undefined;
  document.removeEventListener("wheel", blockScroll);
  document.removeEventListener("touchmove", blockScroll);
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
    intent.outgoing = intent.direction === 1 ? publicScene(1) : adminScene();
    // Own every paint before Astro can expose the destination root. This same
    // opaque scene survives the swap and stays until its last animation frame.
    holdScene(intent);
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
  try {
    const incoming = current.direction === 1 ? adminScene() : publicScene(-1);
    run(
      (current.direction === 1 ? current.outgoing : incoming) as PublicScene,
      (current.direction === 1 ? incoming : current.outgoing) as AdminScene,
      current.direction,
      current.stage!,
    );
  } catch (error) {
    current.outgoing.ghost.host.remove();
    cleanup();
    if (!(error instanceof NoMotionSurface))
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
  else if (intent?.stage) cleanup();
});
window.addEventListener("pagehide", cleanup);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) cleanup();
});
reduced.addEventListener("change", cleanup);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") cleanup();
});
