type Scene = {
  composition: number;
  time: number;
  viewport: number;
  width: number;
  height: number;
  crops: string[];
};
const pageCurrents = new Map<string, Scene>();
// One document-space composition, cropped by each card. No per-card animation clocks.
export function mountSharedCurrents() {
  const hosts = [
    ...document.querySelectorAll<HTMLElement>(
      "main:not([inert]) [data-shared-current]",
    ),
  ];
  if (!hosts.length) return () => {};
  // Choose once per page mount; scrolling, resizing, and theme changes retain it.
  const key = location.pathname;
  const previous = pageCurrents.get(key);
  const state = {
    speed: 0.5,
    amount: 10,
    coverage: 1,
    composition: previous?.composition ?? Math.random() * Math.PI * 2,
  };
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const visible = new Set<HTMLElement>();
  const STEP = 1000 / 30;
  let w = 1,
    h = 1,
    time = previous?.time ?? 0,
    timer: ReturnType<typeof setTimeout> | undefined,
    last = 0;
  const svgs = hosts.map((host) => host.querySelector("svg")!);
  const paths = svgs.map((svg) => [...svg.querySelectorAll("path")]);
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
  function geometry(band: number, layer: number) {
    const upper =
      band === 0
        ? [0.25, 0.18, 0.24, 0.32, 0.28, 0.18, 0.23]
        : [0.81, 0.79, 0.69, 0.74, 0.82, 0.77, 0.83];
    const phase = state.composition;
    const top = [],
      bottom = [];
    for (let i = 0; i < 7; i++) {
      const x = (-0.1 + i * 0.2) * w;
      const recompose = Math.sin(i * 0.87 + phase) * h * 0.09;
      const drift =
        (Math.sin(time * 0.11 + i * 0.8 + band * 2.4) +
          0.35 * Math.sin(time * 0.073 - i * 0.61 + band)) *
        state.amount;
      const base = upper[i] * h + drift + recompose;
      const thickness =
        (band === 0 ? 0.26 : 0.23) *
        h *
        state.coverage *
        (0.85 + 0.22 * Math.sin(i * 0.7 + band + phase));
      const layerSpread =
        thickness * (layer * 0.26 + 0.025 * Math.sin(i * 0.9 + layer));
      top.push({ x, y: base + layerSpread });
      bottom.push({
        x,
        y: base + thickness + Math.sin(i * 1.1 + band) * h * 0.035,
      });
    }
    const reverse = bottom.reverse();
    return (
      curve(top) +
      `L${n(reverse[0].x)} ${n(reverse[0].y)}` +
      curve(reverse, false) +
      "Z"
    );
  }

  function draw(all = false) {
    const shapes = Array.from({ length: 6 }, (_, i) =>
      geometry(i < 3 ? 0 : 1, i % 3),
    );
    hosts.forEach((host, index) => {
      // Offscreen crops keep their last shape until they scroll back in.
      if (!all && !visible.has(host)) return;
      paths[index].forEach((path, i) => path.setAttribute("d", shapes[i]));
      host.dataset.motionTime = time.toFixed(4);
    });
  }
  let layout = "";
  function resize() {
    if (document.documentElement?.hasAttribute("data-writing-transition"))
      return;
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
    boxes.forEach((box, i) =>
      svgs[i].setAttribute(
        "viewBox",
        `${box.left - left} ${box.top - top} ${box.width} ${box.height}`,
      ),
    );
    draw(true);
  }
  // Wake once per drawn frame instead of once per display frame. The drift is
  // well under a pixel a second, so the browser can carry the write to its next
  // frame without the scene needing a frame callback of its own.
  function schedule() {
    timer = setTimeout(tick, Math.max(0, last + STEP - performance.now()));
  }
  function stop() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  function tick() {
    timer = undefined;
    if (media.matches || document.hidden || !visible.size) return;
    const now = performance.now();
    // Hold the destination artwork at the captured phase until its overlay
    // hands back to the real card. Do not accumulate the paused time.
    if (document.documentElement?.hasAttribute("data-writing-transition")) {
      last = now;
      schedule();
      return;
    }
    time += Math.min(now - last, 100) * 0.001 * state.speed;
    last = now;
    draw();
    schedule();
  }
  function sync() {
    stop();
    if (!media.matches && !document.hidden && visible.size) {
      last = performance.now();
      schedule();
    }
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
  const observer = new ResizeObserver(resize);
  hosts.forEach((host) => {
    observer.observe(host);
    intersection.observe(host);
  });
  const main = document.querySelector("main");
  if (main) observer.observe(main);
  media.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  window.addEventListener("resize", resize);
  document.addEventListener("writing:transition-end", resize);
  document.addEventListener("astro:page-load", resize);
  // Restore the known layout before painting. Incoming styles can briefly
  // report fallback font metrics during the document swap.
  if (
    previous &&
    previous.viewport === window.innerWidth &&
    previous.crops.length === svgs.length
  ) {
    w = previous.width;
    h = previous.height;
    previous.crops.forEach((crop, i) => svgs[i].setAttribute("viewBox", crop));
    draw(true);
  } else resize();
  return () => {
    // Offscreen cards catch up before capture, preserving one shared phase.
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
    media.removeEventListener("change", sync);
    document.removeEventListener("visibilitychange", sync);
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
  activeBody = document.body;
  stopScene = mountSharedCurrents();
}
