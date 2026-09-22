import type { CatalogRecord } from "../components/astryx/EditorialApp";

export type ContentDecision = {
  /** A line beside the state chip, only when the chip alone does not say
   * it: a visibility change, or edits waiting to be published. */
  detail?: string;
  /** What opening the row does, spoken as its link name. */
  action?: "Continue draft" | "Review changes";
  view?: "edit" | "review";
  priority: number;
  /** The private draft state could not be read for this record. */
  unavailable?: true;
};
const publicStates = new Set(["published", "featured", "listed"]);
const visibilityLabel = (value: string) =>
  value === "featured"
    ? "Featured"
    : value === "listed"
      ? "Listed"
      : value === "scheduled"
        ? "Scheduled"
        : publicStates.has(value)
          ? "Public"
          : "Hidden";
/** Describe evidenced editorial work, never claim validation or publication readiness. */
export function contentDecision(
  record: CatalogRecord,
  privateStateAvailable = true,
): ContentDecision {
  if (record.capabilities?.reviewOnly || record.href.startsWith("/newsletter/"))
    return { priority: 3 };
  if (!privateStateAvailable && record.privateRevision === undefined)
    return { unavailable: true, priority: 3 };
  const editable = record.capabilities?.editable !== false;
  const review = editable
    ? { action: "Review changes" as const, view: "review" as const }
    : {};
  if (
    record.changesPending &&
    record.intendedVisibility &&
    record.intendedVisibility !== record.status
  ) {
    const before = visibilityLabel(record.status);
    const after = visibilityLabel(record.intendedVisibility);
    if (before !== after)
      return { detail: `${before} to ${after}`, ...review, priority: 0 };
  }
  if (record.status === "draft")
    return {
      ...(editable
        ? { action: "Continue draft" as const, view: "edit" as const }
        : {}),
      priority: 1,
    };
  if (record.changesPending)
    return { detail: "Unpublished edits", ...review, priority: 2 };
  return { priority: 4 };
}
export function decisionHref(href: string, view: "edit" | "review") {
  const url = new URL(href, "https://editorial.invalid");
  if (
    url.origin !== "https://editorial.invalid" ||
    !url.pathname.startsWith("/content/")
  )
    return href;
  if (view === "review") url.searchParams.set("view", "review");
  else url.searchParams.delete("view");
  return `${url.pathname}${url.search}`;
}
