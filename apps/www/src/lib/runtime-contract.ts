/** Closed www runtime configuration contract.
 *
 * Evaluation reports names and bounded states only. Binding objects and secret
 * values never leave this module. Reporting never blocks a request: each route
 * keeps its own checks (a missing DB returns its bounded error, a missing queue
 * records a mocked confirmation, a missing webhook secret returns 501), and
 * /api/health keeps its existing fields and 200/503 semantics.
 *
 * Coverage is dynamic routes only. src/worker.ts only wraps the
 * @astrojs/cloudflare handler, which serves every manifest asset path through
 * env.ASSETS before middleware runs. Those requests never reach this report.
 *
 * The shared evaluator in @anipotts/runtime-contract runs the checks. www
 * keeps its own name predicate, which also accepts function-typed bindings,
 * and its CONTENT_RUNTIME gate.
 */

import {
  evaluateRuntimeContract as evaluate,
  type RuntimeReportWithFeatures,
} from "@anipotts/runtime-contract";

type Source = "assets" | "d1" | "r2" | "queue_producer" | "secret";
type Check = "fetch" | "prepare" | "get" | "send" | "text";

/** Bindings must match apps/www/wrangler.toml and secrets must stay out of it;
 * test/runtime-contract.test.mjs enforces both.
 */
export const RUNTIME_CONTRACT = {
  ASSETS: { source: "assets", check: "fetch" },
  DB: { source: "d1", check: "prepare" },
  CONTENT_DB: { source: "d1", check: "prepare" },
  CONTENT_MEDIA: { source: "r2", check: "get" },
  NEWSLETTER_QUEUE: { source: "queue_producer", check: "send" },
  RESEND_WEBHOOK_SECRET: { source: "secret", check: "text" },
} as const satisfies Record<string, { source: Source; check: Check }>;

export type RuntimeName = keyof typeof RUNTIME_CONTRACT;

export const RUNTIME_REQUIRED = [
  "ASSETS",
] as const satisfies readonly RuntimeName[];

/** Mirrors the existing route checks: env.DB in the newsletter and health
 * routes, env.NEWSLETTER_QUEUE in lib/newsletter.ts,
 * env.RESEND_WEBHOOK_SECRET in the Resend webhook route, and the content
 * reader, which also needs CONTENT_RUNTIME to be exactly "cms".
 */
export const RUNTIME_FEATURES = {
  database: { needs: ["DB"] },
  published_content: { needs: ["CONTENT_DB"], cms: true },
  published_media: { needs: ["CONTENT_DB", "CONTENT_MEDIA"], cms: true },
  confirmation_email: { needs: ["DB", "NEWSLETTER_QUEUE"] },
  resend_webhook: { needs: ["DB", "RESEND_WEBHOOK_SECRET"] },
} as const satisfies Record<
  string,
  { needs: readonly RuntimeName[]; cms?: boolean }
>;

type RuntimeFeature = keyof typeof RUNTIME_FEATURES;
type RuntimeContractReport = RuntimeReportWithFeatures<
  RuntimeName,
  RuntimeFeature
>;
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

const FEATURE_NEEDS = {} as Record<RuntimeFeature, readonly RuntimeName[]>;
for (const [feature, { needs }] of Object.entries(RUNTIME_FEATURES))
  FEATURE_NEEDS[feature as RuntimeFeature] = needs;

/** Pure: reads each contract name and CONTENT_RUNTIME at most once and
 * never throws. A cms feature is unavailable unless CONTENT_RUNTIME is
 * exactly "cms", without naming a missing binding.
 */
export function evaluateRuntimeContract(env: unknown): RuntimeContractReport {
  const report = evaluate<RuntimeName, RuntimeFeature>(env, {
    contract: RUNTIME_CONTRACT,
    required: RUNTIME_REQUIRED,
    features: FEATURE_NEEDS,
    satisfied,
  });
  const cms = read(env, "CONTENT_RUNTIME") === "cms";
  for (const [feature, definition] of Object.entries(RUNTIME_FEATURES))
    if ("cms" in definition && !cms)
      report.features[feature as RuntimeFeature].state = "unavailable";
  return report;
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
