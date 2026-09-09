#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { inspectMigrationChanges } from "./migration-policy.mjs";

export const DEPLOY_TARGETS = [
  "www",
  "admin",
  "ingest",
  "newsletter",
  "state",
  "weekly_email",
];

const MIGRATION_PREFLIGHT_PATHS = [
  /^drizzle\/migrations\//,
  /^drizzle\/meta\//,
  /^drizzle\/README\.md$/,
  /^apps\/admin\/wrangler\.toml$/,
  /^scripts\/ci\/(?:d1-|migration-|site-migrations)/,
];

const CI_POLICY_PATHS = [
  /^\.github\/editorial-publisher\.pem$/,
  /^\.coderabbit\.yaml$/,
  /^\.github\/workflows\//,
  /^config\//,
  /^scripts\/ci\//,
  /^(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json)$/,
];

const LOCAL_DEV_PATHS = [
  /^\.codex\//,
  /^\.nvmrc$/,
  /^docs\/local-development\.md$/,
  /^scripts\/(?:codex-action$|dev\/)/,
];

const APPROVAL_PATHS = [
  /^\.github\/editorial-publisher\.pem$/,
  /^\.github\/workflows\//,
  /^apps\/admin-solid\//,
  /^config\/release-train\.json$/,
  /^drizzle\/migrations\/manifest\.json$/,
  /^scripts\/ci\/(?:branch-protection|d1-migration-conditions|d1-schema-fingerprint|migration-local-proof|migration-policy|release-policy|release-smoke|worker-version)\.mjs$/,
  /^apps\/admin\/src\/middleware\.ts$/,
  /^apps\/admin\/src\/lib\/passkey-auth\.ts$/,
  /^apps\/admin\/src\/pages\/auth\//,
  /(?:^|\/)(?:wrangler\.(?:toml|jsonc)|_routes\.json)$/,
  /(?:^|\/)(?:credentials?|secrets?)(?:\.|\/)/i,
  /^workers\/(?:ingest|newsletter|state|weekly-email)\//,
];

const KNOWN_SAFE_ROOTS = [
  /^\.coderabbit\.yaml$/,
  /^apps\/(?:admin|www)\//,
  /^packages\//,
  /^content\/public\//,
  /^content\/publication\.json$/,
  /^drizzle\/seeds\/public-content\.json$/,
  /^scripts\//,
  /^config\//,
  /^drizzle\/migrations\//,
  /^\.github\/(?:ISSUE_TEMPLATE|CODEOWNERS)/,
  /^(?:\.nvmrc|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|turbo\.json)$/,
];

function parseChange(line) {
  const parts = line.split("\t");
  if (parts.length === 1) return { status: "M", path: parts[0] };
  const status = parts[0];
  return { status, path: parts.at(-1) };
}

export function isReleaseIgnored(path) {
  if (path.startsWith("content/public/")) return false;
  return (
    path.endsWith(".md") ||
    path.startsWith("docs/") ||
    path.startsWith(".github/ISSUE_TEMPLATE/") ||
    path === "LICENSE"
  );
}

export function computeDeployTargets(paths) {
  const targets = Object.fromEntries(
    DEPLOY_TARGETS.map((target) => [target, false]),
  );

  for (const path of paths) {
    if (!path || isReleaseIgnored(path)) continue;
    if (
      path.startsWith("apps/www/") ||
      path.startsWith("content/public/") ||
      path.startsWith("packages/content/src/public/") ||
      path === "packages/content/package.json" ||
      path === "packages/content/src/index.ts" ||
      path.startsWith("packages/brand/")
    ) {
      targets.www = true;
    }

    if (
      path.startsWith("apps/admin/") ||
      path.startsWith("content/public/") ||
      path.startsWith("packages/content/") ||
      path.startsWith("packages/lib/") ||
      path.startsWith("packages/brand/") ||
      path.startsWith("packages/types/")
    ) {
      targets.admin = true;
    }

    if (path.startsWith("packages/types/")) targets.state = true;

    for (const worker of ["ingest", "newsletter", "state", "weekly-email"]) {
      if (path.startsWith(`workers/${worker}/`)) {
        targets[worker.replace("-", "_")] = true;
      }
    }
  }

  return targets;
}

function routeContractChanged(change) {
  return (
    /^[ADR]/.test(change.status) &&
    /^apps\/(?:admin|www)\/src\/pages\//.test(change.path)
  );
}

export function classifyRelease(changeLines, options = {}) {
  const sourceSha = options.sourceSha || "unknown";
  const changes = changeLines.filter(Boolean).map(parseChange);
  const paths = changes.map((change) => change.path);
  const deployTargets = computeDeployTargets(paths);
  const deletedMigrations = changes.filter(
    (change) =>
      change.status.startsWith("D") &&
      /^drizzle\/migrations\/\d{4}_.+\.sql$/.test(change.path),
  );
  const migration = inspectMigrationChanges(
    changes
      .filter((change) => !deletedMigrations.includes(change))
      .map((change) => change.path),
    options,
  );
  if (deletedMigrations.length > 0) {
    migration.changed = true;
    migration.risk = "approval";
    migration.remoteAllowed = false;
    migration.reasons.push(
      ...deletedMigrations.map(
        (change) => `${basename(change.path)}: removed migration`,
      ),
    );
  }
  for (const consumer of migration.consumers) {
    if (Object.hasOwn(deployTargets, consumer)) deployTargets[consumer] = true;
  }
  const reasons = [];
  let risk = migration.risk;

  for (const change of changes) {
    if (isReleaseIgnored(change.path)) continue;
    if (APPROVAL_PATHS.some((pattern) => pattern.test(change.path))) {
      risk = "approval";
      reasons.push(`protected surface: ${change.path}`);
      continue;
    }
    if (routeContractChanged(change)) {
      risk = "approval";
      reasons.push(`route contract changed: ${change.path}`);
      continue;
    }
    if (!KNOWN_SAFE_ROOTS.some((pattern) => pattern.test(change.path))) {
      risk = "unknown";
      reasons.push(`unclassified path: ${change.path}`);
    }
  }

  const hasDeployTarget = Object.values(deployTargets).some(Boolean);
  const docsOnly = changes.length > 0 && paths.every(isReleaseIgnored);
  if (risk === "none" && hasDeployTarget) risk = "automatic";
  if (risk === "none" && !docsOnly && paths.length > 0) risk = "automatic";

  return {
    policy_schema_version: 1,
    release_id: `${sourceSha.slice(0, 12)}-${basename(options.eventName || "release")}`,
    source_sha: sourceSha,
    risk,
    docs_only: docsOnly,
    migration_preflight_required: paths.some((path) =>
      MIGRATION_PREFLIGHT_PATHS.some((pattern) => pattern.test(path)),
    ),
    ci_policy_changed: paths.some((path) =>
      CI_POLICY_PATHS.some((pattern) => pattern.test(path)),
    ),
    local_dev_changed: paths.some((path) =>
      LOCAL_DEV_PATHS.some((pattern) => pattern.test(path)),
    ),
    deploy_targets: deployTargets,
    d1_changed: migration.changed,
    migration_risk: migration.risk,
    migration_consumers: migration.consumers,
    remote_migration_allowed: migration.remoteAllowed,
    database_schema_version: migration.schemaVersion,
    migration_schema_before: migration.schemaFingerprintBefore,
    migration_schema_after: migration.schemaFingerprintAfter,
    reasons: [...new Set([...migration.reasons, ...reasons])],
  };
}

function readChanges(path) {
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function githubOutputs(release) {
  const outputs = {
    release_id: release.release_id,
    source_sha: release.source_sha,
    docs_only: String(release.docs_only),
    migration_preflight_required: String(release.migration_preflight_required),
    ci_policy_changed: String(release.ci_policy_changed),
    local_dev_changed: String(release.local_dev_changed),
    d1_changed: String(release.d1_changed),
    migration_risk: release.migration_risk,
    migration_consumers: release.migration_consumers.join(","),
    remote_migration_allowed: String(release.remote_migration_allowed),
    database_schema_version: release.database_schema_version,
    migration_schema_before: release.migration_schema_before,
    migration_schema_after: release.migration_schema_after,
    ...Object.fromEntries(
      Object.entries(release.deploy_targets).map(([key, value]) => [
        key,
        String(value),
      ]),
    ),
  };
  return Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fileListPath = process.argv[2];
  if (!fileListPath) {
    console.error("usage: release-policy.mjs <name-status-file> [source-sha]");
    process.exit(2);
  }
  try {
    const release = classifyRelease(readChanges(fileListPath), {
      sourceSha: process.argv[3] || process.env.GITHUB_SHA || "unknown",
      eventName: process.env.GITHUB_EVENT_NAME || "release",
    });
    console.log(githubOutputs(release));
    console.error(JSON.stringify(release, null, 2));
    if (release.risk === "unknown") process.exit(1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
