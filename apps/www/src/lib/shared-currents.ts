type Scene = {
  composition: number;
  time: number;
  viewport: number;
  width: number;
  height: number;
  crops: string[];
};
type Motion = {
  /** Clock rate of the idle swell. */
  speed: number;
  /** Swell height in px. */
  amount: number;
  /** Phase offset between stacked layers, so the stripes slide past each other. */
  shear: number;
  /** Band thickness swing in px. */
  breathe: number;
  /** Px an edge travels per px scrolled. */
  push: number;
  /** Entrance duration and staggers in ms. */
  pour: number;
  bandDelay: number;
  cardDelay: number;
  /** Frame rate while the scroll push coasts; the entrance always gets display
   * frames and the idle swell always draws at 30. */
  activeFps: number;
  /** Page band drift as a share of the card swell. */
  page: number;
};
// Below the desktop layout the cards stack into one tall column, so the same
// scroll covers far more of the scene. Phones and tablets get a calmer current.
const DESKTOP: Motion = {
  speed: 2.2,
  amount: 24,
  shear: 1.1,
  breathe: 22,
  push: 0.14,
  pour: 1100,
  bandDelay: 140,
  cardDelay: 90,
  activeFps: 60,
  page: 1,
};
const COMPACT: Motion = {
  speed: 1.6,
  amount: 14,
  shear: 0.9,
  breathe: 10,
  push: 0.07,
  pour: 800,
  bandDelay: 100,
  cardDelay: 70,
  activeFps: 30,
  page: 1,
};
type Point = { x: number; y: number };
type Box = { x: number; y: number; width: number; height: number };
type Segment = { command: string; values: number[] };
const ARITY: Record<string, number> = { M: 2, L: 2, C: 6, S: 4, V: 1, H: 1 };
/** Splits the page bands' authored path data into explicit commands, or null
 * for anything else (relative commands, arcs), which then stays still. */
function parseBand(d: string): Segment[] | null {
  const tokens = d.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g);
  if (!tokens) return null;
  const segments: Segment[] = [];
  let command = "";
  for (let i = 0; i < tokens.length;) {
    if (/[A-Za-z]/.test(tokens[i])) {
      command = tokens[i++];
      if (command === "Z") {
        segments.push({ command, values: [] });
        continue;
      }
      if (!(command in ARITY)) return null;
    } else if (!command || command === "Z") return null;
    const arity = ARITY[command];
    const values = tokens.slice(i, i + arity).map(Number);
    if (values.length < arity || !values.every(Number.isFinite)) return null;
    i += arity;
    segments.push({ command, values });
    // Further pairs after a move are lines.
    if (command === "M") command = "L";
  }
  return segments;
}
/** The segments with every point raised by `lift(x)`. Vertical and horizontal
 * lines become plain lines, since their ends no longer share a coordinate. */
function displaced(segments: Segment[], lift: (x: number) => number) {
  const n = (value: number) => value.toFixed(1);
  let x = 0,
    y = 0,
    d = "";
  for (const { command, values } of segments) {
    if (command === "Z") {
      d += "Z";
      continue;
    }
    const axis = command === "V" || command === "H";
    if (command === "V") y = values[0];
    if (command === "H") x = values[0];
    const points = axis ? [x, y] : values;
    d += axis ? "L" : command;
    for (let k = 0; k < points.length; k += 2)
      d += `${k ? " " : ""}${n(points[k])} ${n(points[k + 1] + lift(points[k]))}`;
    x = points[points.length - 2];
    y = points[points.length - 1];
  }
  return d;
}
const pageCurrents = new Map<string, Scene>();
/** Live values for the dev-only tuner. Production code never writes them. */
export const currentTuning = { desktop: DESKTOP, compact: COMPACT };
let replayEntrance = false;
// The client router reports how it arrived; the first document reports it
// through the navigation timing entry.
let routerNavigation: string | undefined;
function noteNavigation(event: Event) {
  routerNavigation = (event as Event & { navigationType?: string })
    .navigationType;
}
function freshArrival() {
  if (routerNavigation) return routerNavigation !== "traverse";
  const entry = performance.getEntriesByType("navigation")[0] as
    PerformanceNavigationTiming | undefined;
  return !entry || entry.type === "navigate" || entry.type === "prerender";
}
// One document-space composition, cropped by each card. No per-card animation
// clocks. The faint page bands behind the content drift on the same clock.
export function mountSharedCurrents() {
  const hosts = [
    ...document.querySelectorAll<HTMLElement>(
      "main:not([inert]) [data-shared-current]",
    ),
  ];
  const bandArt = document.querySelector<SVGSVGElement>(
    "body > .page-current svg",
  );
  // The authored shape stays on the path, so a remount or a still frame
  // starts from the original art.
  const bands = (bandArt ? [...bandArt.querySelectorAll("path")] : []).flatMap(
    (path) => {
      const source =
        path.getAttribute("data-source") ?? path.getAttribute("d") ?? "";
      path.setAttribute("data-source", source);
      const segments = parseBand(source);
      return segments ? [{ path, source, segments }] : [];
    },
  );
  if (!hosts.length && !bands.length) return () => {};
  // Choose once per page mount; scrolling, resizing, and theme changes retain it.
  const key = location.pathname;
  const previous = pageCurrents.get(key);
  // A route keeps its composition across reloads as well as client navigation.
  let seed = 2166136261;
  for (const char of key) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const composition = ((seed >>> 0) / 4294967296) * Math.PI * 2;
  const state = {
    coverage: 1,
    composition: previous?.composition ?? composition,
  };
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const compact = matchMedia("(max-width: 1023px)");
  const motion = () => (compact.matches ? COMPACT : DESKTOP);
  const visible = new Set<HTMLElement>();
  const IDLE = 1000 / 30;
  // The page bands move a few px a second at low opacity, so 15 frames is
  // smooth, and a page with no card in view only wakes that often.
  const BANDS = 1000 / 15;
  let w = 1,
    h = 1,
    time = previous?.time ?? 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    frame = 0,
    last = 0;
  let cadence = 0;
  const svgs = hosts.map((host) => host.querySelector("svg")!);
  const paths = svgs.map((svg) => [...svg.querySelectorAll("path")]);
  const local = hosts.map((host) => host.hasAttribute("data-local-current"));
  // Each card's visible part of its artwork, in artwork coordinates.
  const crops: Box[] = hosts.map(() => ({ x: 0, y: 0, width: 0, height: 0 }));
  // Cards pour in once, the first time a route is shown in this tab. Reloads,
  // history traversal, returning routes and the writing morph start settled.
  const pour =
    !media.matches &&
    (replayEntrance ||
      (!previous &&
        freshArrival() &&
        !document.documentElement?.hasAttribute("data-writing-transition")));
  replayEntrance = false;
  const entered = new Map<HTMLElement, number>();
  // Scrolling moves the large crests, eased so the current coasts to rest.
  // The rate follows the scene height, so an edge moves `push` px per px
  // scrolled on a short homepage and a long listing alike.
  const pushed = () =>
    hosts.length ? (window.scrollY * motion().push) / Math.max(1, h * 0.09) : 0;
  let flow = 0;
  // One decimal is finer than a device pixel at these sizes and cuts the string
  // each frame rewrites by about a fifth.
  const n = (value: number) => value.toFixed(1);
  function curve(points: { x: number; y: number }[], move = true) {
    let d = move ? `M${n(points[0].x)} ${n(points[0].y)}` : "";
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[Math.max(0, i - 1)],
        b = points[i],
        c = points[i + 1],
        z = points[Math.min(points.length - 1, i + 2)];
      d += `C${n(b.x + (c.x - a.x) / 6)} ${n(b.y + (c.y - a.y) / 6)} ${n(c.x - (z.x - b.x) / 6)} ${n(c.y - (z.y - b.y) / 6)} ${n(c.x)} ${n(c.y)}`;
    }
    return d;
  }
  const sceneWidth = () => w;
  const sceneHeight = () => h;
  function edges(
    band: number,
    layer: number,
    w = sceneWidth(),
    h = sceneHeight(),
    local = false,
  ) {
    const upper =
      local && band === 0
        ? [0.8, 0.65, 0.2, 0.3, 0.6, 0.25, 0.1]
        : band === 0
          ? [0.25, 0.18, 0.24, 0.32, 0.28, 0.18, 0.23]
          : [0.81, 0.79, 0.69, 0.74, 0.82, 0.77, 0.83];
    const phase = state.composition;
    const tune = motion();
    // The press card's local crop is scaled up about twice, so its swell is halved.
    const gain = local ? 0.5 : 1;
    const top: Point[] = [],
      bottom: Point[] = [];
    for (let i = 0; i < 7; i++) {
      const x = (-0.1 + i * 0.2) * w;
      const recompose = Math.sin(i * 0.87 + phase - flow) * h * 0.09;
      const drift =
        (Math.sin(time * 0.11 + i * 0.8 + band * 2.4) +
          0.35 * Math.sin(time * 0.073 - i * 0.61 + band)) *
        tune.amount *
        gain;
      // Upper layers swell on their own phase and slide over the one below.
      const slide = layer
        ? Math.sin(time * 0.17 + i * 0.9 + band + layer * tune.shear) *
          tune.amount *
          gain *
          0.7
        : 0;
      const base = upper[i] * h + drift + recompose;
      const thickness =
        (band === 0 ? 0.26 : 0.23) *
          h *
          state.coverage *
          (0.85 + 0.22 * Math.sin(i * 0.7 + band + phase)) +
        tune.breathe * gain * Math.sin(time * 0.13 + band * 1.9 + i * 0.35);
      const layerSpread =
        thickness * (layer * 0.26 + 0.025 * Math.sin(i * 0.9 + layer));
      top.push({ x, y: base + layerSpread + slide });
      bottom.push({
        x,
        y: base + thickness + Math.sin(i * 1.1 + band) * h * 0.035,
      });
    }
    return { top, bottom };
  }
  function outline(top: Point[], bottom: Point[]) {
    const reverse = [...bottom].reverse();
    return (
      curve(top) +
      `L${n(reverse[0].x)} ${n(reverse[0].y)}` +
      curve(reverse, false) +
      "Z"
    );
  }
  function geometry(band: number, layer: number) {
    const { top, bottom } = edges(band, layer);
    return outline(top, bottom);
  }
  function localGeometry(band: number, layer: number) {
    const { top, bottom } = edges(band, layer, 600, 320, true);
    return outline(top, bottom);
  }
  /** How far a band waits below the card before it pours in: just far
   * enough that none of it shows. The whole band moves as one, so it arrives
   * as a filled, striped flow. Bands that never cross the card stay put. */
  function sunk(band: number, crop: Box, local: boolean) {
    const { top, bottom } = local
      ? edges(band, 0, 600, 320, true)
      : edges(band, 0);
    const span = (local ? 600 : w) * 0.2;
    const floor = crop.y + crop.height;
    let highest = Infinity,
      lowest = -Infinity;
    top.forEach((point, i) => {
      if (point.x < crop.x - span || point.x > crop.x + crop.width + span)
        return;
      highest = Math.min(highest, point.y);
      lowest = Math.max(lowest, bottom[i].y);
    });
    if (lowest < crop.y || highest > floor) return 0;
    return floor - highest + crop.height * 0.1 + 12;
  }
  function lowered(band: number, layer: number, lift: number, local: boolean) {
    const { top, bottom } = local
      ? edges(band, layer, 600, 320, true)
      : edges(band, layer);
    const down = (point: Point) => ({ x: point.x, y: point.y + lift });
    return outline(top.map(down), bottom.map(down));
  }
  /** Each band's remaining entrance, 1 to 0, or null once settled. */
  function rising(index: number, now: number) {
    if (!pour) return null;
    const start = entered.get(hosts[index]);
    if (start === -Infinity) return null;
    const tune = motion();
    const remaining = [0, 1].map((band) => {
      if (start === undefined) return 1;
      const t = (now - start - band * tune.bandDelay) / tune.pour;
      return (1 - Math.min(1, Math.max(0, t))) ** 3;
    });
    if (remaining.every((value) => value === 0)) {
      entered.set(hosts[index], -Infinity);
      return null;
    }
    return remaining;
  }
  // Only entrances that have started count; a card waiting below the fold
  // holds its lowered shape without asking for frames.
  function pouring(now: number) {
    return hosts.some((host, i) => {
      const start = entered.get(host);
      return (
        visible.has(host) &&
        start !== undefined &&
        start !== -Infinity &&
        rising(i, now) !== null
      );
    });
  }

  // Slice geometry of the page band artwork, which spans the whole page.
  const page = { scale: 1, left: 0, width: 1 };
  function measureBands() {
    if (!bandArt) return;
    const box = bandArt.getBoundingClientRect();
    page.scale = Math.max(box.width / 1600, box.height / 1200) || 1;
    page.left = (box.width - 1600 * page.scale) / 2;
    page.width = box.width || 1;
  }
  let bandsSince: number | undefined,
    bandsDrawn = -Infinity;
  /** The cards' drift, applied to the page bands by screen position. */
  function drawBands(now: number) {
    if (!bands.length || now - bandsDrawn < BANDS - 2) return;
    bandsDrawn = now;
    bandsSince ??= now;
    // Ease in from the authored shapes instead of jumping to the swell.
    const ramp = Math.min(1, (now - bandsSince) / 2500);
    const tune = motion();
    const gain =
      (ramp * ramp * (3 - 2 * ramp) * tune.amount * tune.page) / page.scale;
    bands.forEach(({ path, segments }, band) =>
      path.setAttribute(
        "d",
        displaced(segments, (x) => {
          const i = (page.left + x * page.scale) / (0.2 * page.width) + 0.5;
          return (
            (Math.sin(time * 0.11 + i * 0.8 + band * 2.4) +
              0.35 * Math.sin(time * 0.073 - i * 0.61 + band)) *
            gain
          );
        }),
      ),
    );
  }
  function stillBands() {
    bandsSince = undefined;
    bandsDrawn = -Infinity;
    bands.forEach(({ path, source }) => path.setAttribute("d", source));
  }

  function draw(all = false, now = performance.now()) {
    const shapes = Array.from({ length: 6 }, (_, i) =>
      geometry(i < 3 ? 0 : 1, i % 3),
    );
    let localShapes: string[] | undefined;
    hosts.forEach((host, index) => {
      // Offscreen crops keep their last shape until they scroll back in.
      if (!all && !visible.has(host)) return;
      const remaining = rising(index, now);
      const own = local[index];
      const lifts: number[] = [];
      // The entrance is written into the path data rather than a transform,
      // so the writing morph captures exactly what is on screen.
      const shape = (i: number) => {
        const band = i < 3 ? 0 : 1;
        if (remaining?.[band]) {
          lifts[band] ??= remaining[band] * sunk(band, crops[index], own);
          if (lifts[band]) return lowered(band, i % 3, lifts[band], own);
        }
        if (!own) return shapes[i];
        localShapes ??= Array.from({ length: 6 }, (_, j) =>
          localGeometry(j < 3 ? 0 : 1, j % 3),
        );
        return localShapes[i];
      };
      paths[index].forEach((path, i) => path.setAttribute("d", shape(i)));
      host.dataset.motionTime = time.toFixed(4);
      host.dataset.currentReady = "true";
    });
  }
  let layout = "";
  function resize() {
    if (document.documentElement?.hasAttribute("data-writing-transition"))
      return;
    measureBands();
    if (!hosts.length) return;
    const boxes = hosts.map((host) => host.getBoundingClientRect());
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
    const nextLayout = boxes
      .map(
        (box) =>
          `${box.left - left},${box.top - top},${box.width},${box.height}`,
      )
      .join(";");
    if (nextLayout === layout) return;
    layout = nextLayout;
    w = Math.max(...boxes.map((b) => b.right)) - left;
    h = Math.max(...boxes.map((b) => b.bottom)) - top;
    boxes.forEach((box, i) => {
      // The press card slices a fixed 600 by 320 artwork to its own shape.
      const scale = Math.max(box.width / 600, box.height / 320) || 1;
      crops[i] = local[i]
        ? {
            x: (600 - box.width / scale) / 2,
            y: (320 - box.height / scale) / 2,
            width: box.width / scale,
            height: box.height / scale,
          }
        : {
            x: box.left - left,
            y: box.top - top,
            width: box.width,
            height: box.height,
          };
      svgs[i].setAttribute(
        "viewBox",
        local[i]
          ? "0 0 600 320"
          : `${box.left - left} ${box.top - top} ${box.width} ${box.height}`,
      );
    });
    // A new scene height changes the push rate; keep the current where it is.
    flow = pushed();
    draw(true);
  }
  // Idle swell wakes once per drawn frame instead of once per display frame;
  // it moves a few px a second, so 30 frames is smooth. The entrance asks for
  // display frames while it lasts, and so does the scroll push on desktop.
  let interval = IDLE;
  function schedule(now = performance.now()) {
    // Page bands do not consume scroll push. Snap hidden cards so their return
    // starts at the current scroll position without an offscreen coast.
    if (!visible.size) flow = pushed();
    const fps =
      visible.size && pouring(now)
        ? 60
        : visible.size && Math.abs(pushed() - flow) > 1e-4
          ? motion().activeFps
          : 30;
    const idle = visible.size ? IDLE : BANDS;
    interval = fps > 30 ? 1000 / fps : idle;
    if (fps > 30) frame = requestAnimationFrame(tick);
    else timer = setTimeout(tick, Math.max(0, last + idle - now));
  }
  // Cards only count while in view; the page bands are always on screen.
  const running = () =>
    !media.matches &&
    !document.hidden &&
    (visible.size > 0 || bands.length > 0);
  function stop() {
    if (timer !== undefined) clearTimeout(timer);
    if (frame) cancelAnimationFrame(frame);
    timer = undefined;
    frame = 0;
  }
  function tick() {
    timer = undefined;
    frame = 0;
    if (!running()) return;
    const now = performance.now();
    // Hold the destination artwork at the captured phase until its overlay
    // hands back to the real card. Do not accumulate the paused time.
    if (document.documentElement?.hasAttribute("data-writing-transition")) {
      last = now;
      cadence = now;
      schedule(now);
      return;
    }
    // High-refresh displays still draw at the requested rate, not every RAF.
    if (now - cadence < interval - 0.5) {
      schedule(now);
      return;
    }
    const dt = Math.min(now - last, 100) * 0.001;
    time += dt * motion().speed;
    flow += (pushed() - flow) * (1 - Math.exp(-dt * 3.2));
    last = now;
    // Keep the fractional RAF remainder so 90/144 Hz screens average 60 fps.
    cadence +=
      Math.max(1, Math.floor((now - cadence + 0.5) / interval)) * interval;
    draw(false, now);
    drawBands(now);
    schedule(now);
  }
  function sync() {
    stop();
    if (media.matches) stillBands();
    if (running()) {
      last = performance.now();
      cadence = last;
      schedule(last);
    }
  }
  // Leave the idle wait as soon as scrolling starts.
  function scrolled() {
    if (!visible.size) {
      flow = pushed();
      return;
    }
    if (timer !== undefined && motion().activeFps > 30) sync();
  }
  const intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target as HTMLElement);
        else visible.delete(entry.target as HTMLElement);
      }
      draw();
      sync();
    },
    { rootMargin: "100px" },
  );
  // The entrance starts when a card is actually in view, not in the margin.
  const arrival = pour
    ? new IntersectionObserver(
        (entries) => {
          const now = performance.now();
          let delay = 0;
          for (const entry of entries) {
            const host = entry.target as HTMLElement;
            if (!entry.isIntersecting || entered.has(host)) continue;
            entered.set(host, now + delay);
            delay += motion().cardDelay;
            arrival?.unobserve(host);
          }
          sync();
        },
        { rootMargin: "0px 0px -6% 0px" },
      )
    : undefined;
  const observer = new ResizeObserver(resize);
  hosts.forEach((host) => {
    observer.observe(host);
    intersection.observe(host);
    arrival?.observe(host);
  });
  const main = document.querySelector("main");
  if (main) observer.observe(main);
  if (bandArt) observer.observe(bandArt);
  function motionPreferenceChanged() {
    if (media.matches) {
      stop();
      arrival?.disconnect();
      hosts.forEach((host) => entered.set(host, -Infinity));
      draw(true);
      stillBands();
    } else sync();
  }
  media.addEventListener("change", motionPreferenceChanged);
  compact.addEventListener("change", resize);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("scroll", scrolled, { passive: true });
  window.addEventListener("resize", resize);
  document.addEventListener("writing:transition-end", resize);
  document.addEventListener("astro:page-load", resize);
  measureBands();
  // Restore the known layout before painting. Incoming styles can briefly
  // report fallback font metrics during the document swap.
  if (
    previous &&
    previous.viewport === window.innerWidth &&
    previous.crops.length === svgs.length
  ) {
    w = previous.width;
    h = previous.height;
    flow = pushed();
    // A returning route never pours, so its crops are not needed here.
    previous.crops.forEach((crop, i) => svgs[i].setAttribute("viewBox", crop));
    draw(true);
  } else resize();
  // Page bands have no observer to start the loop, so start it here.
  sync();
  return () => {
    // Settle any entrance, then let offscreen cards catch up before capture,
    // preserving one shared phase.
    hosts.forEach((host) => entered.set(host, -Infinity));
    draw(true);
    pageCurrents.set(key, {
      composition: state.composition,
      time,
      viewport: window.innerWidth,
      width: w,
      height: h,
      crops: svgs.map((svg) => svg.getAttribute("viewBox")!),
    });
    if (pageCurrents.size > 40)
      pageCurrents.delete(pageCurrents.keys().next().value!);
    stop();
    observer.disconnect();
    intersection.disconnect();
    arrival?.disconnect();
    media.removeEventListener("change", motionPreferenceChanged);
    compact.removeEventListener("change", resize);
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("scroll", scrolled);
    window.removeEventListener("resize", resize);
    document.removeEventListener("writing:transition-end", resize);
    document.removeEventListener("astro:page-load", resize);
  };
}

// One controller per real document body. Both page-load and the transition
// handoff may request initialization; neither should remount a live scene.
let activeBody: HTMLElement | undefined;
let stopScene: (() => void) | undefined;
export function pauseSharedCurrents() {
  stopScene?.();
  stopScene = undefined;
  activeBody = undefined;
}
export function refreshSharedCurrents() {
  if (activeBody === document.body) return;
  pauseSharedCurrents();
  const body = document.body;
  activeBody = body;
  // Measure once the type has settled, before revealing the first real crop.
  void document.fonts.ready.then(() => {
    if (activeBody !== body || document.body !== body || stopScene) return;
    stopScene = mountSharedCurrents();
  });
}
/** Dev tuner: forget this route's scene and pour it in again. */
export function replaySharedCurrents() {
  pauseSharedCurrents();
  pageCurrents.delete(location.pathname);
  replayEntrance = true;
  refreshSharedCurrents();
}
// Wires the scene to the client router once per document; Shell calls it on
// every page, since the page bands appear on pages without cards.
let installed = false;
export function installSharedCurrents() {
  if (installed) return;
  installed = true;
  document.addEventListener("astro:before-preparation", noteNavigation);
  document.addEventListener("astro:before-preparation", pauseSharedCurrents);
  document.addEventListener("astro:after-swap", refreshSharedCurrents);
  document.addEventListener("astro:page-load", refreshSharedCurrents);
  refreshSharedCurrents();
}
function uninstallSharedCurrents() {
  document.removeEventListener("astro:before-preparation", noteNavigation);
  document.removeEventListener("astro:before-preparation", pauseSharedCurrents);
  document.removeEventListener("astro:after-swap", refreshSharedCurrents);
  document.removeEventListener("astro:page-load", refreshSharedCurrents);
  pauseSharedCurrents();
  installed = false;
}
if (import.meta.hot) import.meta.hot.dispose(uninstallSharedCurrents);
