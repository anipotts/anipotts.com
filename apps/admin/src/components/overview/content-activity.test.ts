import { describe, expect, it } from "vitest";
import {
  activityMatches,
  activityQuery,
  activityRange,
  initialActivityQuery,
  type ActivityRecord,
} from "./content-activity";

describe("content activity", () => {
  const now = Date.parse("2026-11-19T22:00:00Z");
  const records: ActivityRecord[] = [
    {
      id: "home",
      title: "Homepage",
      href: "/content/home/home",
      collection: "home",
      updated: { at: "2026-11-18T14:20:00Z" },
    },
    {
      id: "previous",
      title: "Article",
      href: "/content/writing/previous",
      collection: "writing",
      updated: { at: "2026-11-16T04:30:00Z" },
    },
    {
      id: "future",
      title: "Project",
      href: "/content/projects/future",
      collection: "projects",
      updated: { at: "2026-11-19T23:00:00Z" },
    },
  ];

  it("places Sunday night Eastern in the prior week and excludes future records", () => {
    expect(activityRange("lastWeek", now)).toEqual({
      start: "2026-11-09",
      end: "2026-11-16",
    });
    expect(
      activityMatches(records, initialActivityQuery, now).map(
        (item) => item.id,
      ),
    ).toEqual(["home"]);
    expect(
      activityMatches(
        records,
        { ...initialActivityQuery, period: "lastWeek" },
        now,
      ).map((item) => item.id),
    ).toEqual(["previous"]);
  });

  it("keeps scope through follow-ups and comparison", () => {
    const homepage = activityQuery(
      "only show changes to the homepage",
      initialActivityQuery,
    )!;
    const compare = activityQuery("compare with last week", homepage)!;
    expect(compare).toEqual({ scope: "home", period: "week", compare: true });
    expect(
      activityMatches(records, compare, now).map((item) => item.id),
    ).toEqual(["home"]);
    expect(activityQuery("this month", compare)).toEqual({
      scope: "home",
      period: "month",
      compare: false,
    });
    expect(
      activityMatches(
        records,
        { ...initialActivityQuery, scope: "pages" },
        now,
      ).map((item) => item.id),
    ).toEqual(["home"]);
    expect(
      activityQuery("compare this month with last week", homepage),
    ).toBeNull();
    expect(activityQuery("publish the homepage", homepage)).toBeNull();
  });
});
