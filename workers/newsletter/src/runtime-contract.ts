/**
 * Closed newsletter runtime configuration contract.
 *
 * Evaluation reports names and bounded states only. Binding objects, vars and
 * secret values never leave this module. Reporting is log only: it never
 * blocks, retries, skips or changes a send, and never changes a response.
 * Each handler keeps its own checks.
 */

import {
  createRuntimeReporter,
  evaluateRuntimeContract as evaluate,
  type RuntimeReportWithFeatures,
} from "@anipotts/runtime-contract";

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
type RuntimeContractReport = RuntimeReportWithFeatures<
  RuntimeName,
  RuntimeFeature
>;
type RuntimeEntry = "fetch" | "queue";
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
    "newsletter",
    evaluateRuntimeContract,
    sink,
  );
}
