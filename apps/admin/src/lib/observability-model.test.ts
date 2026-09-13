import { describe, expect, it } from "vitest";
import {
  createUnconfiguredSnapshot,
  deriveServiceState,
  parseObservabilitySnapshot,
  SERVICE_INVENTORY,
  type ServiceObservation,
} from "./observability-model";
const now = Date.parse("2026-09-12T12:00:00.000Z");
const seed = () => createUnconfiguredSnapshot(new Date(now));
const healthy = (): ServiceObservation => ({
  id: "personalcontext-ingestion",
  instrumentation: "execution",
  connection: "connected",
  lastObservedAt: new Date(now - 1000).toISOString(),
  outcome: "success",
  freshnessSeconds: 300,
});
describe("observability coverage", () => {
  it("keeps every inventory entry unknown before observations", () => {
    const snapshot = parseObservabilitySnapshot(seed(), now);
    expect(snapshot.services).toHaveLength(SERVICE_INVENTORY.length);
    expect(snapshot.services.map((s) => deriveServiceState(s, now))).toEqual(
      snapshot.services.map(() => "not-observed"),
    );
  });
  it.each([
    [{ instrumentation: "none" }, "not-instrumented"],
    [{ connection: "disconnected" }, "disconnected"],
    [{ connection: "unknown" }, "not-observed"],
    [{ instrumentation: "unknown" }, "not-observed"],
    [{ lastObservedAt: null }, "not-observed"],
    [{ lastObservedAt: new Date(now - 301000).toISOString() }, "stale"],
    [{ lastObservedAt: new Date(now + 1).toISOString() }, "not-observed"],
    [{ outcome: "unknown" }, "not-observed"],
    [{ outcome: "failure" }, "failed"],
    [{}, "healthy"],
  ] as const)("derives conservative state for %j", (patch, state) => {
    expect(deriveServiceState({ ...healthy(), ...patch }, now)).toBe(state);
  });
});
describe("metadata read boundary", () => {
  it("rejects private arbitrary fields and unknown inventory", () => {
    expect(() =>
      parseObservabilitySnapshot({ ...seed(), query: "private" }, now),
    ).toThrow();
    const snapshot = seed();
    Object.assign(snapshot.services[0], { exception: "private" });
    expect(() => parseObservabilitySnapshot(snapshot, now)).toThrow();
    expect(() =>
      parseObservabilitySnapshot({ ...seed(), services: [] }, now),
    ).toThrow();
  });
  it("rejects duplicate inventory, future timestamps and unconfigured health", () => {
    const snapshot = seed();
    snapshot.services[1] = snapshot.services[0]!;
    expect(() => parseObservabilitySnapshot(snapshot, now)).toThrow();
    expect(() =>
      parseObservabilitySnapshot(
        createUnconfiguredSnapshot(new Date(now + 1)),
        now,
      ),
    ).toThrow();
    const fake = seed();
    fake.services[0] = healthy();
    expect(() => parseObservabilitySnapshot(fake, now)).toThrow();
  });
  it("accepts checkpoint evidence without pretending it measures duration", () => {
    const snapshot = seed();
    snapshot.source = "live";
    snapshot.events.push({
      serviceId: "personalcontext-ingestion",
      at: snapshot.observedAt,
      kind: "committed-checkpoint",
      evidenceId: "1".repeat(32),
    });
    expect(parseObservabilitySnapshot(snapshot, now).spans).toEqual([]);
    Object.assign(snapshot.events[0], { durationMs: 50 });
    expect(() => parseObservabilitySnapshot(snapshot, now)).toThrow();
  });
  it("accepts measured spans and rejects replay timing and invalid numeric values", () => {
    const snapshot = seed();
    snapshot.source = "live";
    snapshot.spans.push({
      serviceId: "personalcontext-ingestion",
      traceId: "1".repeat(32),
      spanId: "2".repeat(16),
      startedAt: new Date(now - 1000).toISOString(),
      durationMs: 100,
      operation: "ingest",
      outcome: "success",
      timing: "measured-execution",
    });
    expect(parseObservabilitySnapshot(snapshot, now).spans).toHaveLength(1);
    snapshot.spans[0]!.durationMs = Infinity;
    expect(() => parseObservabilitySnapshot(snapshot, now)).toThrow();
    Object.assign(snapshot.spans[0], {
      durationMs: 10,
      timing: "replayed-checkpoint",
    });
    expect(() => parseObservabilitySnapshot(snapshot, now)).toThrow();
  });
  it("bounds payload arrays and requires an action for open incidents", () => {
    const snapshot = seed();
    snapshot.source = "live";
    snapshot.incidents.push({
      serviceId: "personalcontext-ingestion",
      evidenceId: "1".repeat(32),
      at: snapshot.observedAt,
      state: "investigating",
      nextAction: "none",
    });
    expect(() => parseObservabilitySnapshot(snapshot, now)).toThrow();
    snapshot.incidents[0]!.nextAction = "inspect-evidence";
    expect(parseObservabilitySnapshot(snapshot, now).incidents).toHaveLength(1);
    snapshot.incidents = Array(101).fill(snapshot.incidents[0]);
    expect(() => parseObservabilitySnapshot(snapshot, now)).toThrow();
  });
  it("rejects incident enrollment outside the PersonalContext pilot", () => {
    for (const serviceId of [
      "mac-local",
      "mac-mini",
      "delegate-collector",
      "enrolled-project-services",
    ] as const) {
      const snapshot = seed();
      snapshot.source = "live";
      snapshot.incidents.push({
        serviceId,
        evidenceId: "1".repeat(32),
        at: snapshot.observedAt,
        state: "investigating",
        nextAction: "inspect-evidence",
      });
      expect(() => parseObservabilitySnapshot(snapshot, now)).toThrow();
    }
  });
  it("returns an independent validated copy", () => {
    const original = seed();
    const result = parseObservabilitySnapshot(original, now);
    original.services[0]!.connection = "connected";
    expect(result.services[0]!.connection).toBe("unknown");
  });
});
