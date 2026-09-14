/**
 * Closed newsletter runtime configuration contract.
 *
 * Evaluation reports names and bounded states only. Binding objects, vars and
 * secret values never leave this module. Reporting is log only: it never
 * blocks, retries, skips or changes a send, and never changes a response.
 * Each handler keeps its own checks.
 */

type Source = "vars" | "d1" | "secret";
type Check = "prepare" | "text";

/** Every name must match workers/newsletter/wrangler.toml; the drift test enforces it. */
export const RUNTIME_CONTRACT = {
  DB: { source: "d1", check: "prepare" },
  RESEND_API_KEY: { source: "secret", check: "text" },
  NEWSLETTER_MAILING_ADDRESS: { source: "secret", check: "text" },
  NEWSLETTER_BASE_URL: { source: "vars", check: "text" },
  NEWSLETTER_FROM: { source: "vars", check: "text" },
  NEWSLETTER_REPLY_TO: { source: "vars", check: "text" },
} as const satisfies Record<string, { source: Source; check: Check }>;

export type RuntimeName = keyof typeof RUNTIME_CONTRACT;

/** Every queued message reads and records through DB. */
export const RUNTIME_REQUIRED = [
  "DB",
] as const satisfies readonly RuntimeName[];

/** Mirrors createTransport (mocked without a key) and sendIssueDelivery. */
export const RUNTIME_FEATURES = {
  confirmation_email: ["RESEND_API_KEY"],
  issue_delivery: ["RESEND_API_KEY", "NEWSLETTER_MAILING_ADDRESS"],
} as const satisfies Record<string, readonly RuntimeName[]>;

/** Read with a code default, so absence changes no feature. */
export const RUNTIME_DEFAULTED = [
  "NEWSLETTER_BASE_URL",
  "NEWSLETTER_FROM",
  "NEWSLETTER_REPLY_TO",
] as const satisfies readonly RuntimeName[];

type RuntimeFeature = keyof typeof RUNTIME_FEATURES;
type RuntimeContractReport = {
  ok: boolean;
  missing: RuntimeName[];
  features: Record<
    RuntimeFeature,
    { state: "available" | "unavailable"; missing: RuntimeName[] }
  >;
};
type RuntimeEntry = "fetch" | "queue";
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
        worker: "newsletter",
        entry,
        ...report,
      });
      if (degraded) sink.warn(line);
      else sink.info(line);
    } catch {
      // Reporting is diagnostic only and must never affect message handling.
    }
  };
}
