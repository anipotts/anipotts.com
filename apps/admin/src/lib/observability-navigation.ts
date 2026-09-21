/**
 * Observability's sidebar and palette destinations, in one place so the
 * sidebar and the command palette cannot drift. Status is the only view for
 * now; Activity and Alerts join this list in a later phase.
 */
export const observabilityNavigation = [
  { id: "status", label: "Status", href: "/operations/observability" },
] as const;

export type ObservabilityDestination = (typeof observabilityNavigation)[number];

/** Status owns the whole route; retired `?view=` links redirect to it. */
export function isObservabilityDestination(
  currentRoute: string,
  destination: ObservabilityDestination,
): boolean {
  return currentRoute.split("?")[0] === destination.href;
}
