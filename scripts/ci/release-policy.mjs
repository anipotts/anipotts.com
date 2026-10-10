#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { inspectMigrationChanges } from "./migration-policy.mjs";
import { firstRule, matchingRules } from "./path-manifest.mjs";

export const DEPLOY_TARGETS = [
  "www",
  "admin",
  "ingest",
  "newsletter",
  "state",
  "weekly_email",
];

function parseChange(line) {
  const parts = line.split("\t");
  if (parts.length === 1) return [{ status: "M", path: parts[0] }];
  const status = parts[0];
  if (/^[RC]\d*$/.test(status) && parts.length === 3) {
    // Renames remove the old path; copies retain it. Both sides affect which
    // contracts must run, even when the destination is outside the old scope.
    return [
      { status: status.startsWith("R") ? "D" : "M", path: parts[1] },
      { status: "A", path: parts[2] },
    ];
  }
  return [{ status, path: parts.at(-1) }];
}

// Path rules live in scripts/ci/path-manifest.mjs; this file applies them.
export function isReleaseIgnored(path) {
  return firstRule("ignored", path)?.ignored === true;
}

export function computeDeployTargets(paths) {
  const targets = Object.fromEntries(
    DEPLOY_TARGETS.map((target) => [target, false]),
  );

  for (const path of paths) {
    if (!path || isReleaseIgnored(path)) continue;
    for (const rule of matchingRules("target", path)) {
      for (const target of rule.targets) targets[target] = true;
    }
  }

  return targets;
}

function riskRule(change) {
  return firstRule("risk", change.path, change.status);
}

// One test for both CI and local scope checks, so they cannot disagree on
// which paths no rule names.
function isUnclassified(change) {
  return !isReleaseIgnored(change.path) && !riskRule(change);
}

export function unclassifiedPaths(changeLines) {
  const changes = changeLines.filter(Boolean).flatMap(parseChange);
  return [
    ...new Set(changes.filter(isUnclassified).map((change) => change.path)),
  ];
}

export function classifyRelease(changeLines, options = {}) {
  const sourceSha = options.sourceSha || "unknown";
  const changes = changeLines.filter(Boolean).flatMap(parseChange);
  const paths = changes.map((change) => change.path);
  const deployTargets = computeDeployTargets(paths);
  const deletedMigrations = changes.filter((change) =>
    firstRule("removed-migration", change.path, change.status),
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
  let unclassified = false;

  for (const change of changes) {
    if (isReleaseIgnored(change.path)) continue;
    const rule = riskRule(change);
    if (rule?.risk === "approval") {
      risk = "approval";
      reasons.push(`${rule.reason}: ${change.path}`);
    } else if (!rule) {
      unclassified = true;
      reasons.push(`unclassified path: ${change.path}`);
    }
  }
  // Fail closed: an unclassified path stays unknown whatever sorts after it.
  if (unclassified) risk = "unknown";

  const flagged = (name) =>
    paths.some((path) =>
      matchingRules("flag", path).some((rule) => rule.flag === name),
    );
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
    migration_preflight_required: flagged("migration_preflight_required"),
    ci_policy_changed: flagged("ci_policy_changed"),
    public_browser_changed: flagged("public_browser_changed"),
    local_dev_changed: flagged("local_dev_changed"),
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
    public_browser_changed: String(release.public_browser_changed),
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
