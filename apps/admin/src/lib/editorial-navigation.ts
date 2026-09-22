import { clientNavigate } from "./client-routes";

export const adminNavigationEvent = "admin:navigate";

/** Moves within the document when the mounted island draws the route, so an
 * open Data session survives, and loads a document otherwise. */
export function commitAdminNavigation(href: string): void {
  if (!clientNavigate(href)) window.location.assign(href);
}

/** The mounted editor may defer navigation until its private save completes. */
export function navigateAdmin(href: string): void {
  const event = new CustomEvent<string>(adminNavigationEvent, {
    detail: href,
    cancelable: true,
  });
  if (window.dispatchEvent(event)) commitAdminNavigation(href);
}
