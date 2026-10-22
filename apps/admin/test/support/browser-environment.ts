import { afterEach, beforeEach } from "vitest";
import { browserMedia } from "./browser-media";

// Real browsers provide matchMedia. jsdom does not; install only the missing
// platform API, preserving deliberate per-suite media fixtures. No Core mock.
const installed = new WeakSet<Window["matchMedia"]>();
let cleanup: (() => void) | undefined;
beforeEach(() => {
  if (typeof window === "undefined") return;
  if (
    typeof window.matchMedia === "function" &&
    !installed.has(window.matchMedia)
  )
    return;
  const previous = Object.getOwnPropertyDescriptor(window, "matchMedia");
  const media = browserMedia(window);
  installed.add(media.matchMedia);
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: media.matchMedia,
  });
  cleanup = () => {
    media.dispose();
    if (window.matchMedia !== media.matchMedia) return;
    if (previous) Object.defineProperty(window, "matchMedia", previous);
    else Reflect.deleteProperty(window, "matchMedia");
  };
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});
