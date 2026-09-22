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
  | "fetch"
  | "prepare"
  | "getByName"
  | "getPut"
  | "text"
  | "flag"
  | "id"
  | "sha"
  | "mode";
export type PublisherMode = "legacy" | "direct" | "maintenance";

/** Names match deployment configuration when their mode is enabled. Each
 * publisher's bindings are needed only in its own mode; production runs direct.
 * This checks binding shape and build identity, not schema or reader readiness.
 */
export const RUNTIME_CONTRACT = {
  ASSETS: { source: "assets", check: "fetch" },
  ACCESS_TEAM_DOMAIN: { source: "vars", check: "text" },
  ACCESS_POLICY_AUD: { source: "vars", check: "text" },
  DB: { source: "d1", check: "prepare" },
  CONTENT_DB: { source: "d1", check: "prepare" },
  CONTENT_MEDIA: { source: "r2", check: "getPut" },
  EDITORIAL: { source: "durable_objects", check: "getByName" },
  COMMAND_RELAY: { source: "durable_objects", check: "getByName" },
  EDITORIAL_ENABLED: { source: "vars", check: "flag" },
  EDITORIAL_PUBLISH_ENABLED: { source: "vars", check: "flag" },
  EDITORIAL_PUBLISH_MODE: { source: "vars", check: "mode" },
  EDITORIAL_GITHUB_APP_ID: { source: "vars", check: "text" },
  EDITORIAL_GITHUB_INSTALLATION_ID: { source: "vars", check: "id" },
  EDITORIAL_GITHUB_PRIVATE_KEY: { source: "secret", check: "text" },
  EDITORIAL_SIGNING_PRIVATE_KEY: { source: "secret", check: "text" },
  PRIVATE_READER_ENABLED: { source: "vars", check: "flag" },
  PRIVATE_READER_OPS_ENABLED: { source: "vars", check: "flag" },
  PRIVATE_READER_SIGNING_KEY: { source: "secret", check: "text" },
  PUBLIC_RELEASE_SHA: { source: "build", check: "sha" },
} as const satisfies Record<string, { source: Source; check: Check }>;

export type RuntimeName = keyof typeof RUNTIME_CONTRACT;

export const RUNTIME_REQUIRED = [
  "ASSETS",
  "ACCESS_TEAM_DOMAIN",
  "ACCESS_POLICY_AUD",
] as const satisfies readonly RuntimeName[];

const legacyEditorialNeeds = [
  "EDITORIAL",
  "EDITORIAL_GITHUB_APP_ID",
  "EDITORIAL_GITHUB_INSTALLATION_ID",
  "EDITORIAL_GITHUB_PRIVATE_KEY",
] as const satisfies readonly RuntimeName[];

/** Mirrors productionEditor, editorialRuntime().publishing, adminDb and the
 * control-plane relay lookup. Flags switch a feature off; needs make an
 * enabled feature unavailable when absent.
 */
const directEditorialNeeds = [
  "EDITORIAL",
  "CONTENT_DB",
] as const satisfies readonly RuntimeName[];

export const RUNTIME_FEATURES = {
  editorial: {
    flags: ["EDITORIAL_ENABLED"],
    needs: {
      legacy: legacyEditorialNeeds,
      direct: directEditorialNeeds,
      maintenance: directEditorialNeeds,
    },
  },
  editorial_publishing: {
    flags: ["EDITORIAL_ENABLED", "EDITORIAL_PUBLISH_ENABLED"],
    needs: {
      legacy: [
        ...legacyEditorialNeeds,
        "EDITORIAL_SIGNING_PRIVATE_KEY",
        "PUBLIC_RELEASE_SHA",
      ],
      direct: [...directEditorialNeeds, "CONTENT_MEDIA", "PUBLIC_RELEASE_SHA"],
      maintenance: [],
    },
  },
  admin_database: { flags: [], needs: ["DB"] },
  control_plane: { flags: [], needs: ["COMMAND_RELAY"] },
} as const satisfies Record<
  string,
  {
    flags: readonly RuntimeName[];
    needs:
      readonly RuntimeName[] | Record<PublisherMode, readonly RuntimeName[]>;
  }
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

/** The one EDITORIAL_PUBLISH_MODE parser. Omission alone keeps the
 * rolling-upgrade legacy default; any other value, or an unreadable
 * configuration, is null and each caller fails closed. */
export function publisherMode(env: unknown): PublisherMode | null {
  const value = read(env, "EDITORIAL_PUBLISH_MODE", unreadable);
  if (value === undefined) return "legacy";
  return value === "legacy" || value === "direct" || value === "maintenance"
    ? value
    : null;
}

function satisfied(env: unknown, name: RuntimeName, release: string) {
  const { check } = RUNTIME_CONTRACT[name];
  if (check === "sha") return GIT_SHA.test(release);
  if (check === "mode") return publisherMode(env) !== null;
  const value = read(env, name, unreadable);
  if (check === "getPut")
    return (
      typeof read(value, "get") === "function" &&
      typeof read(value, "put") === "function"
    );
  if (check === "text") return typeof value === "string" && !!value.trim();
  if (check === "flag") return value === "true";
  if (check === "id") {
    const id = typeof value === "string" && value.trim() ? Number(value) : NaN;
    return Number.isSafeInteger(id) && id > 0;
  }
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
  // Invalid or unreadable configuration never silently enables either publisher.
  const mode = publisherMode(env);
  results.set("EDITORIAL_PUBLISH_MODE", mode !== null);
  const missing = RUNTIME_REQUIRED.filter((name) => !has(name));
  const features = {} as RuntimeContractReport["features"];
  for (const [feature, { flags, needs }] of Object.entries(RUNTIME_FEATURES)) {
    const modeSpecific = "legacy" in needs;
    const enabled =
      (flags as readonly RuntimeName[]).every(has) &&
      !(feature === "editorial_publishing" && mode === "maintenance");
    const selectedNeeds = modeSpecific ? (mode ? needs[mode] : []) : needs;
    const absent: RuntimeName[] = !enabled
      ? []
      : modeSpecific && mode === null
        ? ["EDITORIAL_PUBLISH_MODE"]
        : (selectedNeeds as readonly RuntimeName[]).filter(
            (name) => !has(name),
          );
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
