#!/usr/bin/env node

import assert from "node:assert/strict";
import { protectionPayload, REQUIRED_CHECKS } from "./branch-protection.mjs";
import {
  parseD1SchemaResult,
  schemaFingerprint,
} from "./d1-schema-fingerprint.mjs";
import {
  assertConditionResult,
  selectedConditions,
} from "./d1-migration-conditions.mjs";
import { classifySql, sha256 } from "./migration-policy.mjs";
import { classifyRelease } from "./release-policy.mjs";

const base = { sourceSha: "a".repeat(40), eventName: "pull_request" };

assert.equal(classifyRelease(["docs/release.md"], base).docs_only, true);
const canonicalContentRelease = classifyRelease(
  ["M\tcontent/public/pages/home.md", "A\tcontent/publication.json"],
  base,
);
assert.equal(canonicalContentRelease.docs_only, false);
assert.equal(canonicalContentRelease.risk, "automatic");
assert.equal(canonicalContentRelease.deploy_targets.www, true);
assert.equal(canonicalContentRelease.deploy_targets.admin, true);
assert.equal(
  classifyRelease(["M\tcontent/publication.json"], base).risk,
  "automatic",
);
assert.equal(
  classifyRelease(["M\tcontent/publication-other.json"], base).risk,
  "unknown",
);
const publisherKeyRelease = classifyRelease(
  ["A\t.github/editorial-publisher.pem"],
  base,
);
assert.equal(publisherKeyRelease.risk, "approval");
assert.equal(publisherKeyRelease.ci_policy_changed, true);
assert.equal(
  classifyRelease(["M\tdrizzle/seeds/public-content.json"], base).risk,
  "automatic",
);
assert.equal(
  classifyRelease(["M\tdrizzle/seeds/unreviewed.json"], base).risk,
  "unknown",
);
assert.equal(
  classifyRelease(["M\tapps/admin/src/pages/inbox.astro"], base).risk,
  "automatic",
);
assert.equal(classifyRelease(["M\t.nvmrc"], base).risk, "automatic");
const adminSolidRelease = classifyRelease(
  ["M\tapps/admin-solid/package.json"],
  base,
);
assert.equal(adminSolidRelease.risk, "approval");
assert.equal(
  Object.hasOwn(adminSolidRelease.deploy_targets, "admin_solid"),
  false,
);
assert.deepEqual(adminSolidRelease.reasons, [
  "protected surface: apps/admin-solid/package.json",
]);
assert.equal(
  classifyRelease(["A\tapps/admin/src/pages/new-route.astro"], base).risk,
  "approval",
);
assert.equal(
  classifyRelease(["M\tapps/admin/src/pages/auth/passkey.astro"], base).risk,
  "approval",
);
assert.equal(
  classifyRelease(["M\tapps/www/src/styles/global.css"], base)
    .migration_preflight_required,
  false,
);
assert.equal(
  classifyRelease(["M\tapps/admin/wrangler.toml"], base)
    .migration_preflight_required,
  true,
);
assert.equal(
  classifyRelease(["M\tworkers/newsletter/src/index.ts"], base).risk,
  "approval",
);
assert.equal(classifyRelease(["mystery/file.bin"], base).risk, "unknown");
for (const protectedPath of [
  "config/release-train.json",
  "drizzle/migrations/manifest.json",
  "scripts/ci/release-policy.mjs",
]) {
  assert.equal(
    classifyRelease([`M\t${protectedPath}`], base).risk,
    "approval",
    `${protectedPath} must remain a protected release surface`,
  );
}

const safeSql =
  "CREATE TABLE IF NOT EXISTS release_canary (id TEXT PRIMARY KEY);";
const safeFile = "0043_release_canary.sql";
const safeManifest = {
  bootstrap: {
    status: "pending_explicit_approval",
    automatic_remote_apply: false,
    baseline_through: "0042_admin_inbox_attention_contract.sql",
  },
  historical: [],
  migrations: [
    {
      file: safeFile,
      checksum: `sha256:${sha256(safeSql)}`,
      risk: "automatic",
      consumers: ["admin", "www"],
      preconditions: [{ sql: "SELECT 1 AS ok", expected: { ok: 1 } }],
      postconditions: [{ sql: "SELECT 1 AS ok", expected: { ok: 1 } }],
      rollback: "drop only before consumer deployment",
      schema_fingerprint_before: `sha256:${"1".repeat(64)}`,
      schema_fingerprint_after: `sha256:${"2".repeat(64)}`,
    },
  ],
};
const safeMigration = classifyRelease([`A\tdrizzle/migrations/${safeFile}`], {
  ...base,
  manifest: safeManifest,
  files: [safeFile],
  readFile: () => safeSql,
});
assert.equal(safeMigration.migration_risk, "automatic");
assert.equal(safeMigration.remote_migration_allowed, false);
assert.equal(safeMigration.deploy_targets.admin, true);
assert.equal(safeMigration.deploy_targets.www, true);
assert.equal(safeMigration.database_schema_version, "0043");
assert.equal(safeMigration.migration_schema_before, `sha256:${"1".repeat(64)}`);
assert.equal(safeMigration.migration_schema_after, `sha256:${"2".repeat(64)}`);

const heldFile = "0042_held_rewrite.sql";
const heldSql = "UPDATE release_canary SET id = id;";
const mixedPendingManifest = {
  ...safeManifest,
  bootstrap: {
    ...safeManifest.bootstrap,
    status: "verified",
    automatic_remote_apply: true,
  },
  migrations: [
    {
      ...safeManifest.migrations[0],
      file: heldFile,
      checksum: `sha256:${sha256(heldSql)}`,
      risk: "approval",
    },
    safeManifest.migrations[0],
  ],
};
const heldThenSafe = classifyRelease([`A\tdrizzle/migrations/${safeFile}`], {
  ...base,
  manifest: mixedPendingManifest,
  files: [heldFile, safeFile],
  readFile: (path) => (path.endsWith(heldFile) ? heldSql : safeSql),
});
assert.equal(heldThenSafe.migration_risk, "approval");
assert.equal(heldThenSafe.remote_migration_allowed, false);
assert.match(
  heldThenSafe.reasons.join("\n"),
  /0042_held_rewrite\.sql: approval \(pending\)/,
);

const removedMigration = classifyRelease(
  ["D\tdrizzle/migrations/0044_public_identity_systems.sql"],
  base,
);
assert.equal(removedMigration.risk, "approval");
assert.equal(removedMigration.d1_changed, true);
assert.equal(removedMigration.migration_risk, "approval");
assert.equal(removedMigration.remote_migration_allowed, false);
assert.deepEqual(removedMigration.reasons, [
  "0044_public_identity_systems.sql: removed migration",
]);

assert.throws(
  () =>
    classifyRelease([`A\tdrizzle/migrations/${safeFile}`], {
      ...base,
      manifest: {
        ...safeManifest,
        migrations: [
          {
            ...safeManifest.migrations[0],
            checksum: `sha256:${"0".repeat(64)}`,
          },
        ],
      },
      files: [safeFile],
      readFile: () => safeSql,
    }),
  /checksum does not match/,
);

assert.throws(
  () =>
    classifyRelease([`A\tdrizzle/migrations/${safeFile}`], {
      ...base,
      manifest: {
        ...safeManifest,
        migrations: [
          {
            ...safeManifest.migrations[0],
            schema_fingerprint_after: "not-a-fingerprint",
          },
        ],
      },
      files: [safeFile],
      readFile: () => safeSql,
    }),
  /invalid schema_fingerprint_after/,
);

const pendingFingerprintManifest = {
  ...safeManifest,
  migrations: [
    {
      ...safeManifest.migrations[0],
      schema_fingerprint_before: "pending_bootstrap",
      schema_fingerprint_after: "pending_bootstrap",
    },
  ],
};
assert.doesNotThrow(() =>
  classifyRelease([`A\tdrizzle/migrations/${safeFile}`], {
    ...base,
    manifest: pendingFingerprintManifest,
    files: [safeFile],
    readFile: () => safeSql,
  }),
);
assert.throws(
  () =>
    classifyRelease([`A\tdrizzle/migrations/${safeFile}`], {
      ...base,
      manifest: {
        ...pendingFingerprintManifest,
        bootstrap: {
          ...pendingFingerprintManifest.bootstrap,
          status: "verified",
        },
      },
      files: [safeFile],
      readFile: () => safeSql,
    }),
  /must pin schema fingerprints after bootstrap verification/,
);

assert.equal(
  classifySql("CREATE TABLE IF NOT EXISTS canary (id TEXT PRIMARY KEY);"),
  "automatic",
);
assert.equal(
  classifySql("CREATE INDEX IF NOT EXISTS idx_canary ON canary(id);"),
  "automatic",
);
assert.equal(classifySql("DELETE FROM canary;"), "approval");
assert.equal(classifySql("UPDATE canary SET id = 'x';"), "approval");
assert.equal(classifySql("VACUUM;"), "unknown");

const protection = protectionPayload();
assert.equal(protection.required_status_checks.strict, true);
assert.deepEqual(protection.required_status_checks.contexts, REQUIRED_CHECKS);
assert.equal(protection.required_pull_request_reviews, null);
assert.equal(protection.required_conversation_resolution, true);
assert.equal(protection.enforce_admins, true);

assert.equal(
  selectedConditions(
    safeManifest,
    [`A\tdrizzle/migrations/${safeFile}`],
    "postconditions",
  ).length,
  1,
);
assert.equal(
  selectedConditions(safeManifest, "all-pending", "postconditions").length,
  1,
);
assert.doesNotThrow(() =>
  assertConditionResult({ file: safeFile, expected: { ok: 1 } }, [
    { success: true, results: [{ ok: 1 }], meta: { rows_written: 0 } },
  ]),
);

const schemaRows = [
  {
    type: "table",
    name: "canary",
    tbl_name: "canary",
    sql: "CREATE  TABLE canary ( id TEXT )",
  },
];
assert.equal(schemaFingerprint(schemaRows), schemaFingerprint([...schemaRows]));
assert.deepEqual(
  parseD1SchemaResult([
    { success: true, results: schemaRows, meta: { rows_written: 0 } },
  ]),
  schemaRows,
);
assert.throws(
  () =>
    parseD1SchemaResult([
      { success: true, results: schemaRows, meta: { rows_written: 1 } },
    ]),
  /unexpectedly wrote rows/,
);

console.log("release policy tests passed");
