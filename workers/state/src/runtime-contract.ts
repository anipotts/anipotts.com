/**
 * Closed state worker runtime configuration contract.
 *
 * Evaluation reports names and bounded states only. Binding objects, vars and
 * secret values never leave this module. Reporting is log only: it never
 * blocks a request or changes a response, and it leaves live control and the
 * Durable Objects untouched. Each route keeps its own checks.
 */

type Source = "vars" | "durable_objects" | "secret";
type Check = "idFromName" | "getByName" | "text";

/** Every name must match workers/state/wrangler.toml; the drift test enforces it. */
export const RUNTIME_CONTRACT = {
  LINK_VAULT: { source: "durable_objects", check: "idFromName" },
  CODE_STATS: { source: "durable_objects", check: "idFromName" },
  COMMAND_RELAY: { source: "durable_objects", check: "getByName" },
  ALLOWED_ORIGINS: { source: "vars", check: "text" },
  STATE_PUBLISH_KEY: { source: "secret", check: "text" },
  CONTROL_PLANE_DEVICE_PUBLIC_JWK: { source: "secret", check: "text" },
} as const satisfies Record<string, { source: Source; check: Check }>;

export type RuntimeName = keyof typeof RUNTIME_CONTRACT;

/** The link and commit routes resolve these namespaces on every call. */
export const RUNTIME_REQUIRED = [
  "LINK_VAULT",
  "CODE_STATS",
] as const satisfies readonly RuntimeName[];

/** Mirrors the CORS allowlist, requirePublishKey and the device connect route. */
export const RUNTIME_FEATURES = {
  cors: ["ALLOWED_ORIGINS"],
  publish: ["STATE_PUBLISH_KEY"],
  control_connect: ["COMMAND_RELAY", "CONTROL_PLANE_DEVICE_PUBLIC_JWK"],
} as const satisfies Record<string, readonly RuntimeName[]>;

type RuntimeFeature = keyof typeof RUNTIME_FEATURES;
type RuntimeContractReport = {
  ok: boolean;
  missing: RuntimeName[];
  features: Record<
    RuntimeFeature,
    { state: "available" | "unavailable"; missing: RuntimeName[] }
  >;
};
type RuntimeEntry = "fetch";
type RuntimeLogSink = Pick<Console, "info" | "warn">;

function read(values: unknown, name: string): unknown {
  if (!values || typeof values !== "object") return undefined;
  try {
    return (values as Record<string, unknown>)[name];
  } catch {
    return undefined;
  }
}

function satisfied(env: unknown, name: RuntimeName): boolean {
  const { check } = RUNTIME_CONTRACT[name];
  const value = read(env, name);
  if (check === "text") return typeof value === "string" && !!value.trim();
  return typeof read(value, check) === "function";
}

/** Pure: reads each contract name at most once and never throws. */
export function evaluateRuntimeContract(env: unknown): RuntimeContractReport {
  const results = new Map<RuntimeName, boolean>();
  const has = (name: RuntimeName) => {
    let result = results.get(name);
    if (result === undefined) {
      result = satisfied(env, name);
      results.set(name, result);
    }
    return result;
  };
  const missing = RUNTIME_REQUIRED.filter((name) => !has(name));
  const features = {} as RuntimeContractReport["features"];
  for (const feature of Object.keys(RUNTIME_FEATURES) as RuntimeFeature[]) {
    const needs: readonly RuntimeName[] = RUNTIME_FEATURES[feature];
    const absent = needs.filter((name) => !has(name));
    features[feature] = {
      state: absent.length ? "unavailable" : "available",
      missing: absent,
    };
  }
  return { ok: missing.length === 0, missing, features };
}

/** Returns a reporter that logs one structured line from the first request it sees. */
export function createRuntimeContractReporter(
  sink: RuntimeLogSink = console,
): (env: unknown, entry: RuntimeEntry) => void {
  let reported = false;
  return (env, entry) => {
    if (reported) return;
    reported = true;
    try {
      const report = evaluateRuntimeContract(env);
      const degraded =
        !report.ok ||
        Object.values(report.features).some(
          (feature) => feature.state === "unavailable",
        );
      const line = JSON.stringify({
        event: "runtime_contract",
        worker: "state",
        entry,
        ...report,
      });
      if (degraded) sink.warn(line);
      else sink.info(line);
    } catch {
      // Reporting is diagnostic only and must never affect request handling.
    }
  };
}
