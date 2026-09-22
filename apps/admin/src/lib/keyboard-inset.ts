import { useEffect } from "react";

/**
 * While `active`, keeps `--keyboard-inset` on the root element at the height
 * the on-screen keyboard covers, so a writing toolbar can dock above it. iOS
 * leaves the layout viewport in place and shrinks only the visual viewport,
 * so a fixed bar at bottom 0 would sit behind the keyboard. Browsers without
 * a visual viewport keep the inset at 0.
 */
export function useKeyboardInset(active: boolean) {
  useEffect(() => {
    const viewport =
      typeof window === "undefined" ? null : window.visualViewport;
    if (!active || !viewport) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const covered =
          window.innerHeight - viewport.height - viewport.offsetTop;
        root.style.setProperty(
          "--keyboard-inset",
          `${Math.max(0, Math.round(covered))}px`,
        );
      });
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      root.style.removeProperty("--keyboard-inset");
    };
  }, [active]);
}
