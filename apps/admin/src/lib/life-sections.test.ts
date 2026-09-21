import { describe, expect, it } from "vitest";
import {
  lifeSectionRead,
  lifeSectionSupportsPagination,
} from "./life-sections";
import { lifeReadPath } from "../data/personal-context";
describe("Life section reads", () => {
  it("limits pagination to canonical offset-capable read methods", () => {
    for (const section of ["overview", "preview"] as const) {
      expect(lifeSectionSupportsPagination(section)).toBe(false);
      expect(() => lifeSectionRead(section, { offset: 30 })).toThrow(
        "does not support pagination",
      );
    }
    for (const section of [
      "people",
      "projects",
      "places",
      "timeline",
      "sources",
    ] as const)
      expect(lifeSectionSupportsPagination(section)).toBe(true);
    expect(lifeReadPath(lifeSectionRead("sources"))).toBe(
      "/api/sources?limit=30&offset=0",
    );
  });
  it("dispatches every allowed surface to its own read method", () => {
    expect(lifeSectionRead("overview")).toEqual({ method: "status" });
    expect(lifeSectionRead("sources")).toEqual({
      method: "sources",
      offset: 0,
    });
    expect(lifeSectionRead("timeline")).toEqual({
      method: "timeline",
      offset: 0,
    });
    for (const [section, kind] of [
      ["people", "person"],
      ["projects", "project"],
      ["places", "place"],
    ]) {
      expect(
        lifeSectionRead(section!, { query: "fixture", offset: 30 }),
      ).toEqual({ method: "search", kind, q: "fixture", offset: 30 });
    }
    expect(lifeReadPath(lifeSectionRead("preview", { query: "fixture" }))).toBe(
      "/api/preview?q=fixture&mode=lookup&budget=3000&recent_days=7",
    );
  });
  it("rejects unknown sections and unsupported bounds before dispatch", () => {
    for (const section of ["health", "constructor", "../status", ""])
      expect(() => lifeSectionRead(section)).toThrow("Unknown");
    expect(() =>
      lifeSectionRead("people", { query: "x".repeat(2049) }),
    ).toThrow();
    expect(() => lifeSectionRead("timeline", { offset: -1 })).toThrow();
  });
});

it("preserves bounded source continuation offsets", () => {
  expect(lifeReadPath(lifeSectionRead("sources", { offset: 30 }))).toBe(
    "/api/sources?limit=30&offset=30",
  );
  expect(() => lifeSectionRead("sources", { offset: -1 })).toThrow();
});
