import { describe, expect, it } from "vitest";
import sample from "../fixtures/ops_v1.sample.json";
import {
  healthCollection,
  healthMetricsText,
  parseHealthMetrics,
} from "./health-metrics";
import { parseOpsSnapshot } from "./ops-v1";

describe("health.metrics", () => {
  it("reads exactly ok or a list of known metrics", () => {
    expect(parseHealthMetrics("ok")).toEqual({ kind: "ok" });
    expect(parseHealthMetrics("missing:steps,weight")).toEqual({
      kind: "missing",
      metrics: ["steps", "weight"],
    });
    expect(parseHealthMetrics("missing:active_energy")).toEqual({
      kind: "missing",
      metrics: ["active_energy"],
    });
  });

  it.each([
    "OK",
    "missing:",
    "missing:steps,",
    "missing:steps,steps",
    "missing:heart_rate",
    "missing: steps",
    "missing:steps;weight",
    "steps 4000",
    "",
    null,
    undefined,
  ])("reads %j as unknown, never as data", (detail) => {
    expect(parseHealthMetrics(detail)).toEqual({ kind: "unknown" });
  });

  it("says what did not arrive", () => {
    expect(healthMetricsText(parseHealthMetrics("missing:steps"))).toBe(
      "Steps not arrived in the last 24h",
    );
    expect(
      healthMetricsText(parseHealthMetrics("missing:steps,distance,weight")),
    ).toBe("Steps, distance and weight not arrived in the last 24h");
    expect(healthMetricsText(parseHealthMetrics("ok"))).toBeNull();
  });
});

describe("health collection from the ops snapshot", () => {
  it("takes the last phone sync from health.ingest and no metrics row yet", () => {
    const snapshot = parseOpsSnapshot(sample);
    expect(healthCollection(snapshot)).toEqual({
      // The sample's health.ingest has no success recorded.
      lastPhoneSync: null,
      metrics: null,
    });
  });

  it("reads health.metrics once System lists it", () => {
    const entry = sample.catalog.find((row) => row.id === "health.ingest")!;
    const status = sample.status.find((row) => row.id === "health.ingest")!;
    const snapshot = parseOpsSnapshot({
      ...sample,
      catalog: [
        ...sample.catalog,
        {
          ...entry,
          id: "health.metrics",
          name: "health metrics",
          freshness_budget_s: 7200,
          schedule: "hourly",
        },
      ],
      status: [
        ...sample.status.map((row) =>
          row.id === "health.ingest"
            ? { ...row, last_success_at: "2026-09-21T17:40:00Z" }
            : row,
        ),
        { ...status, id: "health.metrics", detail: "missing:steps" },
      ],
    });
    expect(healthCollection(snapshot)).toEqual({
      lastPhoneSync: "2026-09-21T17:40:00Z",
      metrics: { kind: "missing", metrics: ["steps"] },
    });
  });
});
