import type { CatalogRecord } from "../components/astryx/EditorialApp";

export type ContentDecision = {
  label: string;
  detail?: string;
  action?: "Continue draft" | "Review changes";
  view?: "edit" | "review";
  priority: number;
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
    return {
      label: record.status
        .replaceAll("_", " ")
        .replace(/^./, (letter) => letter.toUpperCase()),
      priority: 3,
    };
  if (!privateStateAvailable && record.privateRevision === undefined)
    return { label: "Draft status unavailable", priority: 3 };
  const editable = record.capabilities?.editable !== false;
  if (
    record.changesPending &&
    record.intendedVisibility &&
    record.intendedVisibility !== record.status
  ) {
    const before = visibilityLabel(record.status);
    const after = visibilityLabel(record.intendedVisibility);
    if (before !== after)
      return {
        label: "Visibility change",
        detail: `${before} → ${after}`,
        ...(editable
          ? { action: "Review changes" as const, view: "review" as const }
          : {}),
        priority: 0,
      };
  }
  if (!publicStates.has(record.status)) {
    if (record.status === "draft")
      return {
        label: "Unpublished draft",
        ...(editable
          ? { action: "Continue draft" as const, view: "edit" as const }
          : {}),
        priority: 1,
      };
    return {
      label:
        record.status === "hidden"
          ? "Hidden from website"
          : record.status.charAt(0).toUpperCase() + record.status.slice(1),
      ...(record.changesPending && editable
        ? {
            action: "Review changes" as const,
            view: "review" as const,
            detail: "Unpublished edits",
          }
        : {}),
      priority: record.changesPending ? 2 : 4,
    };
  }
  if (record.changesPending)
    return {
      label: "Unpublished edits",
      ...(editable
        ? { action: "Review changes" as const, view: "review" as const }
        : {}),
      priority: 2,
    };
  return { label: "Up to date", priority: 4 };
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
