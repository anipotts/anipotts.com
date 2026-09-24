/**
 * Closed ingest runtime configuration contract.
 *
 * Evaluation reports names and bounded states only. Binding objects and
 * secret values never leave this module. Reporting is log only: it never
 * blocks a request or changes a response. Each handler keeps its own checks.
 */

type Source = "d1" | "secret";
type Check = "prepare" | "text";

/** Every name must match workers/ingest/wrangler.toml; the drift test enforces it. */
export const RUNTIME_CONTRACT = {
  DB: { source: "d1", check: "prepare" },
  MAC_MINI_INGEST_KEY: { source: "secret", check: "text" },
  BRANDS_INGEST_KEY: { source: "secret", check: "text" },
} as const satisfies Record<string, { source: Source; check: Check }>;

export type RuntimeName = keyof typeof RUNTIME_CONTRACT;

/** Every write and the GET arrival read use DB. */
export const RUNTIME_REQUIRED = [
  "DB",
] as const satisfies readonly RuntimeName[];

/**
 * brands_email is the only category, and either key authorizes it: the
 * scoped brands key the Apps Script capture sends, or the superset mini key.
 */
export const RUNTIME_FEATURES = {
  brands_ingest: ["BRANDS_INGEST_KEY"],
  mini_ingest: ["MAC_MINI_INGEST_KEY"],
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
type RuntimeEntry = "fetch" | "scheduled";
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

/** Returns a reporter that logs one structured line from the first entry it sees. */
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
        worker: "ingest",
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
