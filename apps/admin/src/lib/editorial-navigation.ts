export const adminNavigationEvent = "admin:navigate";

export function commitAdminNavigation(href: string): void {
  window.location.assign(href);
}

/** The mounted editor may defer navigation until its private save completes. */
export function navigateAdmin(href: string): void {
  const event = new CustomEvent<string>(adminNavigationEvent, {
    detail: href,
    cancelable: true,
  });
  if (window.dispatchEvent(event)) commitAdminNavigation(href);
}
