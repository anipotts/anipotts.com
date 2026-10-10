/**
 * Closed weekly email runtime configuration contract.
 *
 * The worker is retired and sends nothing. Its GET status reads D1, so DB is
 * its only runtime name; it reads no secret. Evaluation reports names and
 * bounded states only. Binding objects never leave this module. Reporting is
 * log only: it never changes a response.
 */

import {
  createRuntimeReporter,
  evaluateRuntimeContract as evaluate,
  type RuntimeReport,
} from "@anipotts/runtime-contract";

type Source = "d1";
type Check = "prepare";

/** Every name must match workers/weekly-email/wrangler.toml; the drift test enforces it. */
export const RUNTIME_CONTRACT = {
  DB: { source: "d1", check: "prepare" },
} as const satisfies Record<string, { source: Source; check: Check }>;

export type RuntimeName = keyof typeof RUNTIME_CONTRACT;

/** The GET status reads the email queue counts from DB. */
export const RUNTIME_REQUIRED = [
  "DB",
] as const satisfies readonly RuntimeName[];

type RuntimeContractReport = RuntimeReport<RuntimeName>;
type RuntimeEntry = "fetch" | "scheduled";
type RuntimeLogSink = Pick<Console, "info" | "warn">;

/** Pure: reads each contract name at most once and never throws. */
export function evaluateRuntimeContract(env: unknown): RuntimeContractReport {
  return evaluate<RuntimeName>(env, {
    contract: RUNTIME_CONTRACT,
    required: RUNTIME_REQUIRED,
  });
}

/** Returns a reporter that logs one structured line from the first entry it sees. */
export function createRuntimeContractReporter(
  sink: RuntimeLogSink = console,
): (env: unknown, entry: RuntimeEntry) => void {
  return createRuntimeReporter<RuntimeEntry>(
    "weekly-email",
    evaluateRuntimeContract,
    sink,
  );
}
