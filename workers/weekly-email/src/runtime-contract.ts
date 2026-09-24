/**
 * Closed weekly email runtime configuration contract.
 *
 * The worker is retired and sends nothing. Its GET status reads D1, so DB is
 * its only runtime name; it reads no secret. Evaluation reports names and
 * bounded states only. Binding objects never leave this module. Reporting is
 * log only: it never changes a response.
 */

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

type RuntimeContractReport = {
  ok: boolean;
  missing: RuntimeName[];
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
  return typeof read(read(env, name), check) === "function";
}

/** Pure: reads each contract name at most once and never throws. */
export function evaluateRuntimeContract(env: unknown): RuntimeContractReport {
  const missing = RUNTIME_REQUIRED.filter((name) => !satisfied(env, name));
  return { ok: missing.length === 0, missing };
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
      const line = JSON.stringify({
        event: "runtime_contract",
        worker: "weekly-email",
        entry,
        ...report,
      });
      if (report.ok) sink.info(line);
      else sink.warn(line);
    } catch {
      // Reporting is diagnostic only and must never affect request handling.
    }
  };
}
