type CanvasWindow = Window & { __apCanvasSync?: () => void };
const installed = new WeakMap<Document, () => void>();

/** Keep the browser canvas beside the visible detail surface. Header artwork
 * retains its own palette; only the reading/overscroll canvas changes. */
export function syncPageCanvas(doc: Document): void {
  const previous = installed.get(doc);
  if (previous) {
    previous();
    return;
  }
  const win = doc.defaultView as CanvasWindow | null;
  if (!win) return;
  let frame: number | undefined;
  const eligible = () =>
    doc.documentElement.matches('.editorial-detail:not([data-theme="dark"])');
  const refresh = (force = true) => {
    const root = doc.documentElement;
    let reading = false;
    if (eligible()) {
      const writing = root.classList.contains("writing-detail");
      const boundary = doc.querySelector(
        writing ? ".article-body" : ".project-head",
      );
      if (boundary) {
        const box = boundary.getBoundingClientRect();
        reading = (writing ? box.top : box.bottom) <= 0;
      }
      // Short project pages reach the footer while the header is still visible.
      // Match paper at the page end, including pages that cannot scroll at all.
      reading ||=
        win.scrollY > 0 &&
        win.scrollY + win.innerHeight >= root.scrollHeight - 1;
      reading ||=
        root.scrollHeight <= win.innerHeight &&
        Boolean(doc.querySelector("body > .foot"));
    }
    const changed = root.hasAttribute("data-reading-canvas") !== reading;
    if (changed) root.toggleAttribute("data-reading-canvas", reading);
    if (!force && !changed) return;
    root.style.colorScheme = root.dataset.theme === "dark" ? "dark" : "light";
    const color = win.getComputedStyle(root).backgroundColor;
    const meta = doc.querySelector('meta[name="theme-color"]');
    if (
      color &&
      color !== "transparent" &&
      color !== "rgba(0, 0, 0, 0)" &&
      meta?.getAttribute("content") !== color
    ) {
      meta?.setAttribute("content", color);
    }
  };
  const schedule = () => {
    if (frame !== undefined || !eligible()) return;
    frame = win.requestAnimationFrame(() => {
      frame = undefined;
      refresh(false);
    });
  };
  const sync = () => refresh();
  installed.set(doc, sync);
  // Reuse the early Shell theme observer and pageshow handler. Their callback
  // delegates here once the body and this module are available.
  win.__apCanvasSync = sync;
  win.addEventListener("scroll", schedule, { passive: true });
  win.addEventListener("resize", schedule, { passive: true });
  win.addEventListener("pagehide", () => {
    if (frame !== undefined) win.cancelAnimationFrame(frame);
    frame = undefined;
  });
  doc.addEventListener("astro:after-swap", sync);
  doc.addEventListener("astro:page-load", sync);
  sync();
}
