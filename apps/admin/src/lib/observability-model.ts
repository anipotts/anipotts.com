/** Metadata-only boundary. No source bodies, queries, paths, errors or free text. */
export const SERVICE_INVENTORY = [
  { id: "mac-local", label: "Local Mac", group: "hosts" },
  { id: "mac-mini", label: "Mac mini", group: "hosts" },
  {
    id: "personalcontext-capture",
    label: "PersonalContext capture",
    group: "personalcontext",
  },
  {
    id: "personalcontext-ingestion",
    label: "PersonalContext ingestion",
    group: "personalcontext",
  },
  {
    id: "personalcontext-retrieval",
    label: "PersonalContext retrieval",
    group: "personalcontext",
  },
  {
    id: "personalcontext-sqlite",
    label: "PersonalContext SQLite",
    group: "personalcontext",
  },
  {
    id: "personalcontext-wiki",
    label: "Personal Wiki",
    group: "personalcontext",
  },
  {
    id: "personalcontext-backups",
    label: "PersonalContext backups",
    group: "personalcontext",
  },
  {
    id: "personalcontext-collector",
    label: "PersonalContext Collector",
    group: "telemetry",
  },
  { id: "delegate-collector", label: "Delegate Collector", group: "telemetry" },
  {
    id: "enrolled-project-services",
    label: "Project service inventory awaiting enrollment",
    group: "projects",
  },
] as const;
export type ServiceId = (typeof SERVICE_INVENTORY)[number]["id"];
export type ServiceObservation = {
  id: ServiceId;
  instrumentation: "unknown" | "none" | "checkpoint" | "execution";
  connection: "unknown" | "connected" | "disconnected";
  lastObservedAt: string | null;
  outcome: "unknown" | "success" | "failure";
  freshnessSeconds: number;
};
export type ServiceState =
  | "not-instrumented"
  | "disconnected"
  | "not-observed"
  | "stale"
  | "failed"
  | "healthy";
export type OperationalEvent = {
  serviceId: ServiceId;
  at: string;
  kind:
    | "committed-checkpoint"
    | "failure"
    | "recovery"
    | "connected"
    | "disconnected";
  evidenceId: string;
};
export type ExecutionSpan = {
  serviceId: ServiceId;
  traceId: string;
  spanId: string;
  startedAt: string;
  durationMs: number;
  operation:
    | "capture"
    | "ingest"
    | "retrieve"
    | "store"
    | "backup"
    | "restore"
    | "export";
  outcome: "success" | "failure";
  timing: "measured-execution";
};
export type MetricObservation = {
  serviceId: ServiceId;
  at: string;
  name:
    | "disk-used-bytes"
    | "disk-limit-bytes"
    | "outbox-depth"
    | "records-committed"
    | "export-failures"
    | "detailed-retention-days"
    | "aggregate-retention-months";
  value: number;
};
export type Incident = {
  serviceId: ServiceId;
  evidenceId: string;
  at: string;
  state: "investigating" | "decision-needed" | "resolved";
  nextAction:
    | "inspect-evidence"
    | "restore-connection"
    | "retry-export"
    | "review-capacity"
    | "verify-recovery"
    | "none";
};
export type ObservabilitySnapshot = {
  version: 1;
  observedAt: string;
  source: "unconfigured" | "live";
  services: ServiceObservation[];
  events: OperationalEvent[];
  spans: ExecutionSpan[];
  metrics: MetricObservation[];
  incidents: Incident[];
};
export function deriveServiceState(
  service: ServiceObservation,
  now = Date.now(),
): ServiceState {
  if (service.instrumentation === "none") return "not-instrumented";
  if (service.connection === "disconnected") return "disconnected";
  if (
    service.instrumentation === "unknown" ||
    service.connection !== "connected" ||
    !service.lastObservedAt
  )
    return "not-observed";
  const age = now - Date.parse(service.lastObservedAt);
  if (!Number.isFinite(age) || age < 0) return "not-observed";
  if (age > service.freshnessSeconds * 1000) return "stale";
  if (service.outcome === "failure") return "failed";
  return service.outcome === "success" ? "healthy" : "not-observed";
}
export function createUnconfiguredSnapshot(
  now = new Date(),
): ObservabilitySnapshot {
  return {
    version: 1,
    observedAt: now.toISOString(),
    source: "unconfigured",
    services: SERVICE_INVENTORY.map(({ id }) => ({
      id,
      instrumentation: "unknown",
      connection: "unknown",
      lastObservedAt: null,
      outcome: "unknown",
      freshnessSeconds: 300,
    })),
    events: [],
    spans: [],
    metrics: [],
    incidents: [],
  };
}
const ids = SERVICE_INVENTORY.map(({ id }) => id);
function fail(): never {
  throw new Error("Invalid observability metadata");
}
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail();
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(record, key)) ||
    Object.keys(record).some((key) => !keys.includes(key))
  )
    return fail();
  return record;
}
function member(value: unknown, allowed: readonly string[]): void {
  if (typeof value !== "string" || !allowed.includes(value)) fail();
}
function timestamp(value: unknown, now: number): void {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  )
    fail();
  const date = Date.parse(value as string);
  if (
    !Number.isFinite(date) ||
    new Date(date).toISOString() !== value ||
    date > now ||
    date < 0
  )
    fail();
}
function number(value: unknown, max = Number.MAX_SAFE_INTEGER): void {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    fail();
}
function hex(value: unknown, length: number): void {
  if (
    typeof value !== "string" ||
    !new RegExp(`^[a-f0-9]{${length}}$`).test(value) ||
    /^0+$/.test(value)
  )
    fail();
}
function array(
  value: unknown,
  max: number,
  check: (item: unknown) => void,
): void {
  if (!Array.isArray(value) || value.length > max) fail();
  (value as unknown[]).forEach(check);
}
/** Strictly reject unknown fields, including nested private metadata. Never log rejected input. */
export function parseObservabilitySnapshot(
  value: unknown,
  now = Date.now(),
): ObservabilitySnapshot {
  const root = object(value, [
    "version",
    "observedAt",
    "source",
    "services",
    "events",
    "spans",
    "metrics",
    "incidents",
  ]);
  if (root.version !== 1) fail();
  timestamp(root.observedAt, now);
  member(root.source, ["unconfigured", "live"]);
  const seen = new Set<unknown>();
  array(root.services, ids.length, (value) => {
    const s = object(value, [
      "id",
      "instrumentation",
      "connection",
      "lastObservedAt",
      "outcome",
      "freshnessSeconds",
    ]);
    member(s.id, ids);
    if (seen.has(s.id)) fail();
    seen.add(s.id);
    member(s.instrumentation, ["unknown", "none", "checkpoint", "execution"]);
    member(s.connection, ["unknown", "connected", "disconnected"]);
    member(s.outcome, ["unknown", "success", "failure"]);
    if (s.lastObservedAt !== null) timestamp(s.lastObservedAt, now);
    number(s.freshnessSeconds, 86400);
    if ((s.freshnessSeconds as number) < 1) fail();
  });
  // Every inventoried component must remain visible, even when disconnected.
  if (seen.size !== ids.length) fail();
  array(root.events, 200, (value) => {
    const e = object(value, ["serviceId", "at", "kind", "evidenceId"]);
    member(e.serviceId, ids);
    timestamp(e.at, now);
    hex(e.evidenceId, 32);
    member(e.kind, [
      "committed-checkpoint",
      "failure",
      "recovery",
      "connected",
      "disconnected",
    ]);
  });
  array(root.spans, 200, (value) => {
    const s = object(value, [
      "serviceId",
      "traceId",
      "spanId",
      "startedAt",
      "durationMs",
      "operation",
      "outcome",
      "timing",
    ]);
    member(s.serviceId, ids);
    timestamp(s.startedAt, now);
    hex(s.traceId, 32);
    hex(s.spanId, 16);
    number(s.durationMs, 86400000);
    member(s.operation, [
      "capture",
      "ingest",
      "retrieve",
      "store",
      "backup",
      "restore",
      "export",
    ]);
    member(s.outcome, ["success", "failure"]);
    member(s.timing, ["measured-execution"]);
    if (Date.parse(s.startedAt as string) + (s.durationMs as number) > now)
      fail();
  });
  array(root.metrics, 200, (value) => {
    const m = object(value, ["serviceId", "at", "name", "value"]);
    member(m.serviceId, ids);
    timestamp(m.at, now);
    number(m.value);
    member(m.name, [
      "disk-used-bytes",
      "disk-limit-bytes",
      "outbox-depth",
      "records-committed",
      "export-failures",
      "detailed-retention-days",
      "aggregate-retention-months",
    ]);
  });
  array(root.incidents, 100, (value) => {
    const i = object(value, [
      "serviceId",
      "evidenceId",
      "at",
      "state",
      "nextAction",
    ]);
    // The incident pilot is limited to PersonalContext; broader coverage is read-only.
    member(
      i.serviceId,
      ids.filter((id) => id.startsWith("personalcontext-")),
    );
    timestamp(i.at, now);
    hex(i.evidenceId, 32);
    member(i.state, ["investigating", "decision-needed", "resolved"]);
    member(i.nextAction, [
      "inspect-evidence",
      "restore-connection",
      "retry-export",
      "review-capacity",
      "verify-recovery",
      "none",
    ]);
    if (i.state !== "resolved" && i.nextAction === "none") fail();
  });
  if (
    root.source === "unconfigured" &&
    ((root.events as unknown[]).length ||
      (root.spans as unknown[]).length ||
      (root.metrics as unknown[]).length ||
      (root.incidents as unknown[]).length ||
      (root.services as ServiceObservation[]).some(
        (s) =>
          s.instrumentation !== "unknown" ||
          s.connection !== "unknown" ||
          s.lastObservedAt !== null ||
          s.outcome !== "unknown",
      ))
  )
    fail();
  return structuredClone(root) as ObservabilitySnapshot;
}
