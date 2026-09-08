// One document-space composition, cropped by each card. No per-card animation clocks.
export function mountSharedCurrents() {
  const hosts = [
    ...document.querySelectorAll<HTMLElement>("[data-shared-current]"),
  ];
  if (!hosts.length) return () => {};
  // Choose once per page mount; scrolling, resizing, and theme changes retain it.
  const state = {
    speed: 0.5,
    amount: 10,
    coverage: 1,
    composition: Math.random() * Math.PI * 2,
  };
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  const visible = new Set<HTMLElement>();
  let w = 1,
    h = 1,
    time = 0,
    frame = 0,
    last = 0;
  const svgs = hosts.map((host) => host.querySelector("svg")!);
  const paths = svgs.map((svg) => [...svg.querySelectorAll("path")]);
  function curve(points: { x: number; y: number }[], move = true) {
    let d = move ? `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}` : "";
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[Math.max(0, i - 1)],
        b = points[i],
        c = points[i + 1],
        z = points[Math.min(points.length - 1, i + 2)];
      d += `C${(b.x + (c.x - a.x) / 6).toFixed(2)} ${(b.y + (c.y - a.y) / 6).toFixed(2)} ${(c.x - (z.x - b.x) / 6).toFixed(2)} ${(c.y - (z.y - b.y) / 6).toFixed(2)} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
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
      `L${reverse[0].x.toFixed(2)} ${reverse[0].y.toFixed(2)}` +
      curve(reverse, false) +
      "Z"
    );
  }

  function draw(all = false) {
    const shapes = Array.from({ length: 6 }, (_, i) =>
      geometry(i < 3 ? 0 : 1, i % 3),
    );
    hosts.forEach((host, index) => {
      if (!all && !visible.has(host)) return;
      paths[index].forEach((path, i) => path.setAttribute("d", shapes[i]));
      host.dataset.motionTime = time.toFixed(4);
    });
  }
  function resize() {
    const boxes = hosts.map((host) => host.getBoundingClientRect());
    const left = Math.min(...boxes.map((b) => b.left));
    const top = Math.min(...boxes.map((b) => b.top));
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
  function tick(now: number) {
    frame = 0;
    if (media.matches || document.hidden || !visible.size) return;
    const elapsed = now - last;
    if (elapsed >= 1000 / 30) {
      time += Math.min(elapsed, 100) * 0.001 * state.speed;
      last = now;
      draw();
    }
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!media.matches && !document.hidden && visible.size) {
      last = performance.now();
      frame = requestAnimationFrame(tick);
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
  resize();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    intersection.disconnect();
    media.removeEventListener("change", sync);
    document.removeEventListener("visibilitychange", sync);
    window.removeEventListener("resize", resize);
  };
}
