/** Input around writing navigations, in every theme and motion setting:
 * the destination is requested when a finger or pointer lands, a tapped card
 * acknowledges the tap while its article loads, a repeat tap on the link
 * already loading is ignored, and the last input modality decides whether
 * focus moved by a navigation shows a ring. */

import { prefetch } from "astro:prefetch";
import type { TransitionBeforePreparationEvent } from "astro:transitions/client";

let keyboard = false;
let loading: string | undefined;

/** Whether the visitor last navigated with the keyboard. */
export const keyboardNavigation = () => keyboard;

const warm = (event: Event) => {
  const link = (event.target as Element | null)?.closest?.(
    "a.writing-card, a.back, .more-heading a",
  );
  if (
    link instanceof HTMLAnchorElement &&
    link.origin === location.origin &&
    link.pathname !== location.pathname
  )
    prefetch(link.href, { ignoreSlowConnection: true });
};
for (const type of ["pointerdown", "touchstart"])
  document.addEventListener(type, warm, { capture: true, passive: true });

const modality = (event: Event) => (keyboard = event.type === "keydown");
for (const type of ["pointerdown", "touchstart", "keydown"])
  document.addEventListener(type, modality, { capture: true, passive: true });

document.addEventListener("astro:before-preparation", (raw) => {
  const event = raw as TransitionBeforePreparationEvent;
  const { href } = event.to;
  const card = event.sourceElement?.closest<HTMLElement>("a.writing-card");
  if (card) card.dataset.writingPending = "";
  loading = href;
  const settle = () => {
    if (card) delete card.dataset.writingPending;
    if (loading === href) loading = undefined;
  };
  event.signal.addEventListener("abort", settle, { once: true });
  document.addEventListener("astro:after-swap", settle, { once: true });
});

// Runs before the router's own click listener, which then leaves the click
// alone: a second tap would abort and restart the same fetch.
document.addEventListener(
  "click",
  (event) => {
    const link = (event.target as Element | null)?.closest?.("a[href]");
    const plain = !(event.metaKey || event.ctrlKey || event.shiftKey);
    if (
      plain &&
      loading &&
      (link as HTMLAnchorElement | null)?.href === loading
    )
      event.preventDefault();
  },
  { capture: true },
);
