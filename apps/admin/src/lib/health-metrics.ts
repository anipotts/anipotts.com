/**
 * What System's ops snapshot says about health collection, for Data Health.
 *
 * - `health.ingest` ("health data received", when the phone pushes) holds
 *   the last phone sync as its own `last_success_at`, a field System serves
 *   today; /v1/health/daily carries no push time.
 * - `health.metrics` (System, announced 2026-09-22 16:50, not live yet) is
 *   one hourly job whose detail is exactly `ok`, or `missing:` and a comma
 *   list of the expected metrics that did not arrive in the last 24 hours
 *   (`missing:steps,weight`). Any other detail is unknown, never data.
 *
 * Nothing here reads a health value; both are catalog rows of machine
 * metadata.
 */
import { opsServices, type OpsSnapshot } from "./ops-v1";

export const HEALTH_INGEST_ID = "health.ingest";
export const HEALTH_METRICS_ID = "health.metrics";

/** The metric words `missing:` may list, as the Health view names them.
 * Steps, distance, flights and active energy are expected today; weight
 * joins with the Withings collector. Sleep, heart rate and HRV have no
 * collector and are never expected. */
export const HEALTH_METRIC_LABELS = {
  steps: "Steps",
  distance: "Distance",
  flights: "Flights",
  active_energy: "Active energy",
  weight: "Weight",
} as const;
export type HealthMetricName = keyof typeof HEALTH_METRIC_LABELS;

export type HealthMetricsState =
  | { kind: "ok" }
  | { kind: "missing"; metrics: HealthMetricName[] }
  | { kind: "unknown" };

const UNKNOWN: HealthMetricsState = Object.freeze({ kind: "unknown" });

/** A `health.metrics` detail, strictly: `ok`, `missing:<known,...>`, or
 * unknown. A repeated or unlisted metric makes the whole detail unknown. */
export function parseHealthMetrics(
  detail: string | null | undefined,
): HealthMetricsState {
  if (detail === "ok") return { kind: "ok" };
  const match = /^missing:([a-z_]+(?:,[a-z_]+)*)$/.exec(detail ?? "");
  if (!match) return UNKNOWN;
  const names = match[1]!.split(",");
  if (
    new Set(names).size !== names.length ||
    !names.every((name) => Object.hasOwn(HEALTH_METRIC_LABELS, name))
  )
    return UNKNOWN;
  return { kind: "missing", metrics: names as HealthMetricName[] };
}

/** "Steps and weight not arrived in the last 24h", for Status' detail. */
export function healthMetricsText(state: HealthMetricsState): string | null {
  if (state.kind !== "missing") return null;
  const labels = state.metrics.map((name, index) =>
    index === 0
      ? HEALTH_METRIC_LABELS[name]
      : HEALTH_METRIC_LABELS[name].toLowerCase(),
  );
  const list =
    labels.length > 1
      ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`
      : labels[0]!;
  return `${list} not arrived in the last 24h`;
}

export type HealthCollection = {
  /** The phone's last push, from health.ingest's own success. */
  lastPhoneSync: string | null;
  /** health.metrics, when System lists it; null when it does not. */
  metrics: HealthMetricsState | null;
};

export function healthCollection(snapshot: OpsSnapshot): HealthCollection {
  const services = opsServices(snapshot);
  const ingest = services.find((service) => service.id === HEALTH_INGEST_ID);
  const metrics = services.find((service) => service.id === HEALTH_METRICS_ID);
  return {
    lastPhoneSync: ingest?.missingStatus
      ? null
      : (ingest?.status.last_success_at ?? null),
    metrics:
      metrics && !metrics.missingStatus
        ? parseHealthMetrics(metrics.status.detail)
        : null,
  };
}
