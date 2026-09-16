import { marqueeDuration, motionPaused } from "./workflow-motion";
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
  let cycle = 0;

  function measure() {
    if (disposed) return;
    track
      .querySelectorAll("[data-source-clone]")
      .forEach((node) => node.remove());
    if (motion.matches) {
      delete root.dataset.animated;
      button.hidden = true;
      cycle = 0;
      keyframe();
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
    }
    keyframe();
    sync();
  }

  /**
   * The compositor owns the drift from here: one keyframe, no frame loop.
   * Re-measuring writes the same two lengths, so a resize or a late font does
   * not restart the strip from its start position.
   */
  function keyframe() {
    const lengths: [string, string][] = [
      ["--source-cycle", cycle ? `${cycle}px` : ""],
      ["--source-cycle-duration", cycle ? `${marqueeDuration(cycle)}s` : ""],
    ];
    for (const [name, value] of lengths) {
      if (track.style.getPropertyValue(name) === value) continue;
      if (value) track.style.setProperty(name, value);
      else track.style.removeProperty(name);
    }
  }

  function sync() {
    const paused =
      !cycle ||
      disposed ||
      motionPaused(userPaused, visible, document.hidden, motion.matches);
    // CSS reads this to set animation-play-state; nothing wakes the main thread.
    root.dataset.motion = paused ? "paused" : "running";
    // The server-rendered name stays fixed; aria-pressed alone reports the pause.
    button.setAttribute("aria-pressed", String(userPaused));
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
    sync();
    listeners.abort();
    resize.disconnect();
    intersection.disconnect();
  };
}

document.addEventListener("astro:before-swap", () => {
  for (const dispose of mounted.values()) dispose();
  mounted.clear();
});
