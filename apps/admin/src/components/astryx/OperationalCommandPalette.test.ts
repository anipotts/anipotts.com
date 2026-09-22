import { describe, expect, it } from "vitest";
import {
  operationalDestinations,
  operationalSearchNavigation,
} from "./OperationalCommandPalette";
import { navItems } from "../../data/admin";

describe("operational search adapter", () => {
  it("starts with current workspace destinations and scopes advanced navigation", () => {
    expect(operationalDestinations.map((row) => row.label)).toEqual([
      "Status",
      "Activity",
      "Alerts",
    ]);
    expect(operationalDestinations.map((row) => row.href)).toEqual([
      "/observability/status",
      "/observability/activity",
      "/observability/alerts",
    ]);
    const advanced = operationalSearchNavigation(navItems);
    expect(advanced.some((row) => row.href.startsWith("/inbox"))).toBe(false);
    for (const href of ["/fleet", "/repos", "/deploys"])
      expect(advanced.some((row) => row.href === href)).toBe(false);
    expect(advanced.some((row) => row.href === "/work?view=now")).toBe(true);
    expect(
      advanced.some((row) =>
        ["content", "life", "website"].includes(row.group),
      ),
    ).toBe(false);
    expect(
      advanced.some((row) => /carousels|preview|projects/.test(row.href)),
    ).toBe(false);
  });
});
