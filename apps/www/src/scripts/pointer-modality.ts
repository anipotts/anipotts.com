const installed = new WeakSet<Document>();

/** Visual feedback only: never cancel scrolling, clicks, or move focus. */
export function installPointerModality(doc: Document): void {
  if (installed.has(doc)) return;
  installed.add(doc);
  let touch = false;
  const paint = () => {
    doc.documentElement.toggleAttribute("data-touch-input", touch);
  };
  const pointer = (event: PointerEvent) => {
    touch = event.pointerType === "touch" || event.pointerType === "pen";
    paint();
  };
  doc.addEventListener("pointerdown", pointer, {
    capture: true,
    passive: true,
  });
  doc.addEventListener("pointermove", pointer, { passive: true });
  doc.addEventListener(
    "touchstart",
    () => {
      touch = true;
      paint();
    },
    { capture: true, passive: true },
  );
  doc.addEventListener(
    "keydown",
    () => {
      touch = false;
      paint();
    },
    { capture: true },
  );
  doc.addEventListener("astro:after-swap", paint);
}
