import { marqueeOffset, motionPaused } from "./workflow-motion";
const mounted = new Map<HTMLElement, () => void>();

/** The source strip is decorative; the complete workflow is server-rendered. */
export function mountWorkflows() {
  for (const [root, dispose] of mounted)
    if (!root.isConnected) {
      dispose();
      mounted.delete(root);
    }
  document.querySelectorAll<HTMLElement>("[data-workflow]").forEach((root) => {
    if (!mounted.has(root)) mounted.set(root, enhance(root));
  });
}

function enhance(root: HTMLElement) {
  const track = root.querySelector<HTMLElement>(".source-track")!;
  const viewport = root.querySelector<HTMLElement>(".source-window")!;
  const button = root.querySelector<HTMLButtonElement>("[data-motion-toggle]")!;
  const originals = Array.from(track.children) as HTMLElement[];
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const listeners = new AbortController();
  let disposed = false,
    userPaused = false,
    visible = false;
  let frame = 0,
    last = 0,
    offset = 0,
    cycle = 0;

  function measure() {
    if (disposed) return;
    track
      .querySelectorAll("[data-source-clone]")
      .forEach((node) => node.remove());
    track.style.transform = "";
    if (motion.matches) {
      delete root.dataset.animated;
      button.hidden = true;
      cycle = 0;
      sync();
      return;
    }
    root.dataset.animated = "";
    button.hidden = false;
    const gap = parseFloat(getComputedStyle(track).columnGap);
    cycle = originals.reduce(
      (sum, item) => sum + item.getBoundingClientRect().width + gap,
      0,
    );
    if (cycle > 0) {
      // Fill wide screens with decorative copies, without repeating accessible content.
      const copies = Math.ceil(viewport.clientWidth / cycle) + 1;
      for (let n = 0; n < copies; n++)
        for (const original of originals) {
          const clone = original.cloneNode(true) as HTMLElement;
          clone.dataset.sourceClone = "";
          clone.setAttribute("aria-hidden", "true");
          clone
            .querySelectorAll("symbol[id]")
            .forEach((symbol) => symbol.remove());
          clone
            .querySelectorAll("[id]")
            .forEach((node) => node.removeAttribute("id"));
          track.appendChild(clone);
        }
      offset %= cycle;
      track.style.transform = `translate3d(${-offset}px,0,0)`;
    }
    sync();
  }

  function tick(time: number) {
    frame = 0;
    const elapsed = last ? Math.min((time - last) / 1000, 0.1) : 0;
    last = time;
    offset = marqueeOffset(offset, elapsed, cycle);
    track.style.transform = `translate3d(${-offset}px,0,0)`;
    frame = requestAnimationFrame(tick);
  }

  function sync() {
    const paused = motionPaused(
      userPaused,
      visible,
      document.hidden,
      motion.matches,
    );
    root.dataset.motion = paused ? "paused" : "running";
    // The server-rendered name stays fixed; aria-pressed alone reports the pause.
    button.setAttribute("aria-pressed", String(userPaused));
    if (paused || !cycle) {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
    } else if (!frame && !disposed) frame = requestAnimationFrame(tick);
  }
  const options = { signal: listeners.signal };
  button.addEventListener(
    "click",
    () => {
      userPaused = !userPaused;
      sync();
    },
    options,
  );
  // Hover and focus deliberately leave the strip moving; the button is explicit.
  document.addEventListener("visibilitychange", sync, options);
  motion.addEventListener("change", measure, options);
  const resize = new ResizeObserver(measure);
  resize.observe(viewport);
  const intersection = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      sync();
    },
    { threshold: 0 },
  );
  intersection.observe(viewport);
  measure();
  void document.fonts.ready.then(() => {
    if (!disposed) measure();
  });
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    listeners.abort();
    resize.disconnect();
    intersection.disconnect();
  };
}

document.addEventListener("astro:before-swap", () => {
  for (const dispose of mounted.values()) dispose();
  mounted.clear();
});
