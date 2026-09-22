/**
 * What System's ops snapshot says about health collection, for Data Health.
 *
 * - `health.metrics` (System, announced 2026-09-22 16:50, not live yet) is
 *   one hourly job whose detail is exactly `ok`, or `missing:` and a comma
 *   list of the expected metrics that did not arrive in the last 24 hours
 *   (`missing:steps,weight`). Any other detail is unknown, never data. The
 *   detail is only the last check's answer, so it is trusted only while the
 *   check itself is current: its row ok (or degraded, naming what is
 *   missing) and the sampler running. A stale, failing, asleep or unknown
 *   row, or a stopped sampler, is "Not checked", never a stale ok.
 * - The last phone sync is withheld. `health.ingest`'s `last_success_at` is
 *   the modification time of the file the phone export writes (System S-14),
 *   which any rewrite moves, so it is not a phone's arrival. Health reads
 *   "Not recorded" until System serves a real arrival marker.
 *
 * Nothing here reads a health value; the check is a catalog row of machine
 * metadata.
 */
import { opsServices, type OpsSnapshot } from "./ops-v1";

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

/** What the per-metric check says now: its answer, or that it is not
 * checking. */
export type HealthMetricsCheck =
  | { kind: "ok" }
  | { kind: "missing"; metrics: HealthMetricName[] }
  | { kind: "not_checked" };

/**
 * The `health.metrics` answer, judged by the row as well as its detail.
 * Null while System lists no such entry. `ok` stands only on an ok row;
 * a `missing:` list on an ok or degraded row; anything else, a stopped
 * sampler or a detail that is not the agreed shape, is not checked.
 */
export function healthMetricsCheck(
  snapshot: OpsSnapshot,
  samplerStopped: boolean,
): HealthMetricsCheck | null {
  const row = opsServices(snapshot).find(
    (service) => service.id === HEALTH_METRICS_ID,
  );
  if (!row) return null;
  const NOT_CHECKED = { kind: "not_checked" } as const;
  if (row.missingStatus || samplerStopped) return NOT_CHECKED;
  const answer = parseHealthMetrics(row.status.detail);
  if (answer.kind === "ok")
    return row.status.state === "ok" ? answer : NOT_CHECKED;
  if (answer.kind === "missing")
    return row.status.state === "ok" || row.status.state === "degraded"
      ? answer
      : NOT_CHECKED;
  return NOT_CHECKED;
}
