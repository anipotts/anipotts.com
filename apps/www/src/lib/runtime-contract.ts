/** Closed www runtime configuration contract.
 *
 * Evaluation reports names and bounded states only. Binding objects and secret
 * values never leave this module. Reporting never blocks a request: each route
 * keeps its own checks (a missing DB returns its bounded error, a missing queue
 * records a mocked confirmation, a missing webhook secret returns 501), and
 * /api/health keeps its existing fields and 200/503 semantics.
 *
 * Coverage is dynamic routes only. apps/www has no custom workerEntryPoint, so
 * the @astrojs/cloudflare handler serves every manifest asset path through
 * env.ASSETS before middleware runs. Those requests never reach this report.
 */

type Source = "assets" | "d1" | "queue_producer" | "secret";
type Check = "fetch" | "prepare" | "send" | "text";

/** Bindings must match apps/www/wrangler.toml and secrets must stay out of it;
 * test/runtime-contract.test.mjs enforces both.
 */
export const RUNTIME_CONTRACT = {
  ASSETS: { source: "assets", check: "fetch" },
  DB: { source: "d1", check: "prepare" },
  NEWSLETTER_QUEUE: { source: "queue_producer", check: "send" },
  RESEND_WEBHOOK_SECRET: { source: "secret", check: "text" },
} as const satisfies Record<string, { source: Source; check: Check }>;

export type RuntimeName = keyof typeof RUNTIME_CONTRACT;

export const RUNTIME_REQUIRED = [
  "ASSETS",
] as const satisfies readonly RuntimeName[];

/** Mirrors the existing route checks: env.DB in the newsletter and health
 * routes, env.NEWSLETTER_QUEUE in lib/newsletter.ts and
 * env.RESEND_WEBHOOK_SECRET in the Resend webhook route.
 */
export const RUNTIME_FEATURES = {
  database: { needs: ["DB"] },
  confirmation_email: { needs: ["DB", "NEWSLETTER_QUEUE"] },
  resend_webhook: { needs: ["DB", "RESEND_WEBHOOK_SECRET"] },
} as const satisfies Record<string, { needs: readonly RuntimeName[] }>;

type RuntimeFeature = keyof typeof RUNTIME_FEATURES;
type RuntimeFeatureState = "available" | "unavailable";
type RuntimeContractReport = {
  ok: boolean;
  missing: RuntimeName[];
  features: Record<
    RuntimeFeature,
    { state: RuntimeFeatureState; missing: RuntimeName[] }
  >;
};
type RuntimeLogSink = Pick<Console, "info" | "warn">;

const sha = /^[a-f0-9]{40}$/;

function read(values: unknown, name: string): unknown {
  if (!values || (typeof values !== "object" && typeof values !== "function"))
    return undefined;
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
  const missing: RuntimeName[] = RUNTIME_REQUIRED.filter((name) => !has(name));
  const features = {} as RuntimeContractReport["features"];
  for (const [feature, { needs }] of Object.entries(RUNTIME_FEATURES)) {
    const absent = (needs as readonly RuntimeName[]).filter(
      (name) => !has(name),
    );
    features[feature as RuntimeFeature] = {
      state: absent.length ? "unavailable" : "available",
      missing: absent,
    };
  }
  return { ok: missing.length === 0, missing, features };
}

let reported = false;

/** Log one structured line per isolate from the first dynamic request. */
export function reportRuntimeContract(
  env: unknown,
  release: string,
  sink: RuntimeLogSink = console,
): void {
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
      app: "www",
      entry: "middleware",
      release: sha.test(release) ? release : "dev",
      ...report,
    });
    if (degraded) sink.warn(line);
    else sink.info(line);
  } catch {
    // Reporting is diagnostic only and must never affect request handling.
  }
}
