/**
 * Closed state worker runtime configuration contract.
 *
 * Evaluation reports names and bounded states only. Binding objects, vars and
 * secret values never leave this module. Reporting is log only: it never
 * blocks a request or changes a response, and it leaves live control and the
 * Durable Objects untouched. Each route keeps its own checks.
 */

import {
  createRuntimeReporter,
  evaluateRuntimeContract as evaluate,
  read,
  satisfied,
  type RuntimeReportWithFeatures,
} from "@anipotts/runtime-contract";

type Source = "vars" | "durable_objects" | "secret";
type Check = "idFromName" | "getByName" | "text";

/** Every name must match workers/state/wrangler.toml; the drift test enforces it. */
export const RUNTIME_CONTRACT = {
  LINK_VAULT: { source: "durable_objects", check: "idFromName" },
  CODE_STATS: { source: "durable_objects", check: "idFromName" },
  COMMAND_RELAY: { source: "durable_objects", check: "getByName" },
  ALLOWED_ORIGINS: { source: "vars", check: "text" },
  STATE_PUBLISH_KEY: { source: "secret", check: "text" },
  STATE_READ_KEY: { source: "secret", check: "text" },
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
  private_read: ["STATE_READ_KEY"],
  control_connect: ["COMMAND_RELAY", "CONTROL_PLANE_DEVICE_PUBLIC_JWK"],
} as const satisfies Record<string, readonly RuntimeName[]>;

type RuntimeFeature = keyof typeof RUNTIME_FEATURES;
type RuntimeContractReport = RuntimeReportWithFeatures<
  RuntimeName,
  RuntimeFeature
>;
type RuntimeEntry = "fetch";
type RuntimeLogSink = Pick<Console, "info" | "warn">;

/** A read credential must not grant publish authority through key reuse. */
export function hasDistinctStateReadKey(env: unknown): boolean {
  const readKey = read(env, "STATE_READ_KEY");
  const publishKey = read(env, "STATE_PUBLISH_KEY");
  return (
    typeof readKey === "string" &&
    readKey.trim() !== "" &&
    readKey !== publishKey
  );
}

/** Pure: reads each contract name at most once and never throws. */
export function evaluateRuntimeContract(env: unknown): RuntimeContractReport {
  return evaluate<RuntimeName, RuntimeFeature>(env, {
    contract: RUNTIME_CONTRACT,
    required: RUNTIME_REQUIRED,
    features: RUNTIME_FEATURES,
    satisfied: (values, name) =>
      name === "STATE_READ_KEY"
        ? hasDistinctStateReadKey(values)
        : satisfied(RUNTIME_CONTRACT, values, name),
  });
}

/** Returns a reporter that logs one structured line from the first request it sees. */
export function createRuntimeContractReporter(
  sink: RuntimeLogSink = console,
): (env: unknown, entry: RuntimeEntry) => void {
  return createRuntimeReporter<RuntimeEntry>(
    "state",
    evaluateRuntimeContract,
    sink,
  );
}
