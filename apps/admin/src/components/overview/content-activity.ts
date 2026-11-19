import { dayKey } from "../workspace/format";
import type { CatalogRecord } from "../astryx/EditorialApp";

export type ActivityPeriod = "today" | "week" | "month" | "lastWeek";
type ActivityScope = "all" | "home" | "writing" | "projects" | "pages";
export type ActivityQuery = {
  period: ActivityPeriod;
  scope: ActivityScope;
  compare: boolean;
};

export const initialActivityQuery: ActivityQuery = {
  period: "week",
  scope: "all",
  compare: false,
};

export const periodLabels: Record<ActivityPeriod, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  lastWeek: "Last week",
};

export const scopeLabels: Record<ActivityScope, string> = {
  all: "All content",
  home: "Homepage",
  writing: "Writing",
  projects: "Projects",
  pages: "Pages",
};

export type ActivityRecord = {
  id: string;
  recordId?: string;
  title: string;
  href: string;
  collection?: string;
  projectIdentity?: CatalogRecord["projectIdentity"];
  updated: { at: string };
};

const DAY = 86_400_000;
const pageCollections = new Set([
  "home",
  "workPage",
  "writingPage",
  "systemsPage",
  "newsletterPage",
  "pages",
]);

/** Date keys use Eastern calendar boundaries, even across clock changes.
 * The artificial UTC day below is for arithmetic on the calendar key only. */
export function activityRange(period: ActivityPeriod, now: number) {
  const today = dayKey(now);
  const utcDay = new Date(`${today}T00:00:00Z`);
  const monday = +utcDay - ((utcDay.getUTCDay() + 6) % 7) * DAY;
  const key = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  switch (period) {
    case "today":
      return { start: today, end: key(+utcDay + DAY) };
    case "month":
      return { start: `${today.slice(0, 7)}-01`, end: key(+utcDay + DAY) };
    case "lastWeek":
      return { start: key(monday - 7 * DAY), end: key(monday) };
    case "week":
      return { start: key(monday), end: key(+utcDay + DAY) };
  }
}

export function activityMatches(
  rows: readonly ActivityRecord[],
  { period, scope }: ActivityQuery,
  now: number,
) {
  const { start, end } = activityRange(period, now);
  return rows.filter((row) => {
    const at = Date.parse(row.updated.at);
    const day = dayKey(at);
    if (day < start || day >= end || at > now) return false;
    switch (scope) {
      case "all":
        return true;
      case "home":
        return /^\/content\/(?:edit\/home|home\/home|pages\/home)$/.test(
          row.href,
        );
      case "writing":
      case "projects":
        return row.collection === scope;
      case "pages":
        return (
          row.href.startsWith("/content/edit/") ||
          pageCollections.has(row.collection ?? "")
        );
    }
  });
}

/** A small read-only activity filter. The service supplying the records is
 * independent of the phrasing and the filter cannot request another source. */
export function activityQuery(
  input: string,
  current: ActivityQuery,
): ActivityQuery | null {
  const value = input.trim().toLowerCase();
  if (/^(?:reset|clear|all activity)$/.test(value)) return initialActivityQuery;
  const compare = /\b(?:compare|versus|vs\.?)\b/.test(value);
  const period = /\btoday\b/.test(value)
    ? "today"
    : /\bthis month\b/.test(value)
      ? "month"
      : /\bthis week\b/.test(value) || (compare && /\blast week\b/.test(value))
        ? "week"
        : /\blast week\b/.test(value)
          ? "lastWeek"
          : undefined;
  const scope = /\b(?:home ?page|home)\b/.test(value)
    ? "home"
    : /\b(?:writing|articles|posts)\b/.test(value)
      ? "writing"
      : /\bprojects\b/.test(value)
        ? "projects"
        : /\bpages\b/.test(value)
          ? "pages"
          : /\b(?:all content|everything)\b/.test(value)
            ? "all"
            : undefined;
  if (
    /\b(?:publish|delete|remove|create|upload)\b/.test(value) ||
    /\b(?:last month|yesterday|this year|alerts?|issues?|pull requests?|site code)\b/.test(
      value,
    ) ||
    (compare && (period !== "week" || !/\blast week\b/.test(value)))
  )
    return null;
  if (!period && !scope) return null;
  return {
    scope: scope ?? current.scope,
    period: period ?? current.period,
    compare: compare || (!period && current.compare),
  };
}
