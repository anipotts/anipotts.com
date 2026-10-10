/**
 * Closed ingest runtime configuration contract.
 *
 * Evaluation reports names and bounded states only. Binding objects and
 * secret values never leave this module. Reporting is log only: it never
 * blocks a request or changes a response. Each handler keeps its own checks.
 */

import {
  createRuntimeReporter,
  evaluateRuntimeContract as evaluate,
  type RuntimeReportWithFeatures,
} from "@anipotts/runtime-contract";

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
type RuntimeContractReport = RuntimeReportWithFeatures<
  RuntimeName,
  RuntimeFeature
>;
type RuntimeEntry = "fetch" | "scheduled";
type RuntimeLogSink = Pick<Console, "info" | "warn">;

/** Pure: reads each contract name at most once and never throws. */
export function evaluateRuntimeContract(env: unknown): RuntimeContractReport {
  return evaluate<RuntimeName, RuntimeFeature>(env, {
    contract: RUNTIME_CONTRACT,
    required: RUNTIME_REQUIRED,
    features: RUNTIME_FEATURES,
  });
}

/** Returns a reporter that logs one structured line from the first entry it sees. */
export function createRuntimeContractReporter(
  sink: RuntimeLogSink = console,
): (env: unknown, entry: RuntimeEntry) => void {
  return createRuntimeReporter<RuntimeEntry>(
    "ingest",
    evaluateRuntimeContract,
    sink,
  );
}
