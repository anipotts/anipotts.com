/// <reference types="astro/client" />
import { GIT_SHA } from "./patterns";

/** Closed admin runtime configuration contract.
 *
 * Evaluation reports names and bounded states only. Binding objects and
 * variable values never leave this module. Reporting never blocks a request:
 * Cloudflare Access answers every unauthenticated probe at the edge, so no
 * release smoke reaches the Worker and a startup rejection would ship green
 * and lock the owner out. Each surface keeps its own fail-closed checks.
 */

type Source =
  "assets" | "vars" | "d1" | "r2" | "durable_objects" | "secret" | "build";
type Check =
  "fetch" | "prepare" | "getByName" | "getPut" | "text" | "flag" | "sha";

/** Names match deployment configuration when their feature is enabled.
 * This checks binding shape and build identity, not schema or reader readiness.
 */
export const RUNTIME_CONTRACT = {
  ASSETS: { source: "assets", check: "fetch" },
  ACCESS_TEAM_DOMAIN: { source: "vars", check: "text" },
  ACCESS_POLICY_AUD: { source: "vars", check: "text" },
  /** anipotts-db, bound so deploy applies its migrations. No admin page
   * reads it, so no feature needs it. */
  DB: { source: "d1", check: "prepare" },
  CONTENT_DB: { source: "d1", check: "prepare" },
  CONTENT_MEDIA: { source: "r2", check: "getPut" },
  EDITORIAL: { source: "durable_objects", check: "getByName" },
  EDITORIAL_ENABLED: { source: "vars", check: "flag" },
  EDITORIAL_PUBLISH_ENABLED: { source: "vars", check: "flag" },
  PRIVATE_READER_ENABLED: { source: "vars", check: "flag" },
  PRIVATE_READER_OPS_ENABLED: { source: "vars", check: "flag" },
  /** Data Health's health:read issuance. Unset in production until System's
   * daily health collection is proven. */
  PRIVATE_READER_HEALTH_ENABLED: { source: "vars", check: "flag" },
  /** Data Knowledge's entity reads. Unset in production until System serves
   * the entity routes. */
  PRIVATE_READER_KNOWLEDGE_ENABLED: { source: "vars", check: "flag" },
  PRIVATE_READER_SIGNING_KEY: { source: "secret", check: "text" },
  PRIVATE_READER_CANARY_ENABLED: { source: "vars", check: "flag" },
  PRIVATE_READER_CANARY_ACCESS_AUD: { source: "vars", check: "text" },
  PRIVATE_READER_CANARY_CLIENT_ID: { source: "vars", check: "text" },
  PUBLIC_RELEASE_SHA: { source: "build", check: "sha" },
} as const satisfies Record<string, { source: Source; check: Check }>;

export type RuntimeName = keyof typeof RUNTIME_CONTRACT;

export const RUNTIME_REQUIRED = [
  "ASSETS",
  "ACCESS_TEAM_DOMAIN",
  "ACCESS_POLICY_AUD",
] as const satisfies readonly RuntimeName[];

/** Mirrors productionEditor. Flags switch a feature off; needs make an
 * enabled feature unavailable when absent. EDITORIAL_PUBLISH_ENABLED is the
 * publishing kill switch. The private reader's issuance routes sign with
 * PRIVATE_READER_SIGNING_KEY, so a reader flag that is on without the key
 * reports its feature unavailable instead of ok (A-34): the Data credential
 * (private_reader) and the Observability one (private_reader_ops, which also
 * needs PRIVATE_READER_ENABLED, as privateReaderModeEnabled does). DB is
 * bound for migrations only and backs no feature: reporting it available
 * would claim a read that no page makes.
 */
export const RUNTIME_FEATURES = {
  editorial: {
    flags: ["EDITORIAL_ENABLED"],
    needs: ["EDITORIAL", "CONTENT_DB"],
  },
  editorial_publishing: {
    flags: ["EDITORIAL_ENABLED", "EDITORIAL_PUBLISH_ENABLED"],
    needs: ["EDITORIAL", "CONTENT_DB", "CONTENT_MEDIA", "PUBLIC_RELEASE_SHA"],
  },
  private_reader: {
    flags: ["PRIVATE_READER_ENABLED"],
    needs: ["PRIVATE_READER_SIGNING_KEY"],
  },
  private_reader_ops: {
    flags: ["PRIVATE_READER_ENABLED", "PRIVATE_READER_OPS_ENABLED"],
    needs: ["PRIVATE_READER_SIGNING_KEY"],
  },
} as const satisfies Record<
  string,
  { flags: readonly RuntimeName[]; needs: readonly RuntimeName[] }
>;

type RuntimeFeature = keyof typeof RUNTIME_FEATURES;
type RuntimeFeatureState = "available" | "disabled" | "unavailable";
type RuntimeContractReport = {
  ok: boolean;
  missing: RuntimeName[];
  features: Record<
    RuntimeFeature,
    { state: RuntimeFeatureState; missing: RuntimeName[] }
  >;
};
type RuntimeEntry = "fetch" | "durable_object";
type RuntimeLogSink = Pick<Console, "info" | "warn">;

const unreadable = Symbol("unreadable");

function read(
  values: unknown,
  name: string,
  onError: unknown = undefined,
): unknown {
  if (!values || typeof values !== "object") return undefined;
  try {
    return (values as Record<string, unknown>)[name];
  } catch {
    return onError;
  }
}

function satisfied(env: unknown, name: RuntimeName, release: string) {
  const { check } = RUNTIME_CONTRACT[name];
  if (check === "sha") return GIT_SHA.test(release);
  const value = read(env, name, unreadable);
  if (check === "getPut")
    return (
      typeof read(value, "get") === "function" &&
      typeof read(value, "put") === "function"
    );
  if (check === "text") return typeof value === "string" && !!value.trim();
  if (check === "flag") return value === "true";
  return typeof read(value, check) === "function";
}

/** Pure: reads each contract name at most once and never throws. */
export function evaluateRuntimeContract(
  env: unknown,
  release: string,
): RuntimeContractReport {
  const results = new Map<RuntimeName, boolean>();
  const has = (name: RuntimeName) => {
    let result = results.get(name);
    if (result === undefined) {
      result = satisfied(env, name, release);
      results.set(name, result);
    }
    return result;
  };
  const missing = RUNTIME_REQUIRED.filter((name) => !has(name));
  const features = {} as RuntimeContractReport["features"];
  for (const [feature, { flags, needs }] of Object.entries(RUNTIME_FEATURES)) {
    const enabled = (flags as readonly RuntimeName[]).every(has);
    const absent: RuntimeName[] = enabled
      ? (needs as readonly RuntimeName[]).filter((name) => !has(name))
      : [];
    features[feature as RuntimeFeature] = {
      state: !enabled
        ? "disabled"
        : absent.length
          ? "unavailable"
          : "available",
      missing: absent,
    };
  }
  return { ok: missing.length === 0, missing, features };
}

let reported = false;

/** Log one structured line per isolate from whichever entry runs first. */
export function reportRuntimeContract(
  env: unknown,
  entry: RuntimeEntry,
  release: string = import.meta.env.PUBLIC_RELEASE_SHA || "dev",
  sink: RuntimeLogSink = console,
): void {
  if (reported) return;
  reported = true;
  try {
    const report = evaluateRuntimeContract(env, release);
    const degraded =
      !report.ok ||
      Object.values(report.features).some(
        (feature) => feature.state === "unavailable",
      );
    const line = JSON.stringify({
      event: "runtime_contract",
      app: "admin",
      entry,
      release: GIT_SHA.test(release) ? release : "dev",
      ...report,
    });
    if (degraded) sink.warn(line);
    else sink.info(line);
  } catch {
    // Reporting is diagnostic only and must never affect request handling.
  }
}
