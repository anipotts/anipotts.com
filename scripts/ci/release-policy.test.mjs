#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { protectionPayload, REQUIRED_CHECKS } from "./branch-protection.mjs";
import {
  parseD1SchemaResult,
  schemaFingerprint,
} from "./d1-schema-fingerprint.mjs";
import {
  assertConditionResult,
  selectedConditions,
} from "./d1-migration-conditions.mjs";
import { classifySql, loadManifest, sha256 } from "./migration-policy.mjs";
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

// A-23: a release without a migration reports the highest migration
// production has applied, not the bootstrap baseline it was recorded after.
const cssOnly = ["M\tapps/www/src/styles/global.css"];
const appliedFile = "0044_release_canary_rows.sql";
const appliedRecord = { ...safeManifest.migrations[0], file: appliedFile };
const appliedManifest = {
  bootstrap: {
    status: "verified",
    automatic_remote_apply: true,
    baseline_through: "0043_admin_auth_v2.sql",
    schema_fingerprint: `sha256:${"1".repeat(64)}`,
  },
  historical: [],
  migrations: [appliedRecord],
};
const afterApplied = classifyRelease(cssOnly, {
  ...base,
  manifest: appliedManifest,
  files: [appliedFile],
  readFile: () => safeSql,
});
assert.equal(afterApplied.d1_changed, false);
assert.equal(afterApplied.database_schema_version, "0044");
assert.equal(afterApplied.migration_schema_before, `sha256:${"2".repeat(64)}`);
assert.equal(afterApplied.migration_schema_after, `sha256:${"2".repeat(64)}`);
const baselineOnly = classifyRelease(cssOnly, {
  ...base,
  manifest: { ...appliedManifest, migrations: [] },
  files: [],
});
assert.equal(baselineOnly.database_schema_version, "0043");
assert.equal(baselineOnly.migration_schema_after, `sha256:${"1".repeat(64)}`);

// A-23: an approval record never applies automatically, so a release merged
// after it keeps the previous applied version and fingerprint.
const heldApprovalFile = "0045_held_rewrite.sql";
const heldApprovalSql = "UPDATE release_canary SET id = id;";
const heldApprovalRecord = {
  ...safeManifest.migrations[0],
  file: heldApprovalFile,
  checksum: `sha256:${sha256(heldApprovalSql)}`,
  risk: "approval",
  schema_fingerprint_before: `sha256:${"2".repeat(64)}`,
  schema_fingerprint_after: `sha256:${"3".repeat(64)}`,
};
const behindHeldFile = "0046_release_canary_index.sql";
const behindHeldRecord = {
  ...safeManifest.migrations[0],
  file: behindHeldFile,
  schema_fingerprint_before: `sha256:${"3".repeat(64)}`,
  schema_fingerprint_after: `sha256:${"4".repeat(64)}`,
};
const heldReadFile = (path) =>
  path.endsWith(heldApprovalFile) ? heldApprovalSql : safeSql;
const approvalMerged = classifyRelease(cssOnly, {
  ...base,
  manifest: {
    ...appliedManifest,
    migrations: [appliedRecord, heldApprovalRecord],
  },
  files: [appliedFile, heldApprovalFile],
  readFile: heldReadFile,
});
assert.equal(approvalMerged.d1_changed, false);
assert.equal(
  approvalMerged.database_schema_version,
  "0044",
  "A-23: an approval migration merged but unapplied keeps the previous version",
);
assert.equal(approvalMerged.migration_schema_after, `sha256:${"2".repeat(64)}`);

// A-23: an automatic record behind a held approval record is held with it,
// because its own release stops on the pending approval record.
const heldChain = {
  ...appliedManifest,
  migrations: [behindHeldRecord, appliedRecord, heldApprovalRecord],
};
const behindHeld = classifyRelease(cssOnly, {
  ...base,
  manifest: heldChain,
  files: [appliedFile, heldApprovalFile, behindHeldFile],
  readFile: heldReadFile,
});
assert.equal(
  behindHeld.database_schema_version,
  "0044",
  "A-23: an automatic migration behind a held one is not applied",
);
assert.equal(behindHeld.migration_schema_after, `sha256:${"2".repeat(64)}`);
const heldChainRelease = classifyRelease(
  [`A\tdrizzle/migrations/${behindHeldFile}`],
  {
    ...base,
    manifest: heldChain,
    files: [appliedFile, heldApprovalFile, behindHeldFile],
    readFile: heldReadFile,
  },
);
assert.equal(heldChainRelease.remote_migration_allowed, false);

// A-23: after the approval file is applied under approval and a reviewed
// manifest change records it as history, as 0043 was, the version advances.
const approvalRecorded = classifyRelease(cssOnly, {
  ...base,
  manifest: {
    ...appliedManifest,
    historical: [[heldApprovalFile, sha256(heldApprovalSql)]],
    migrations: [appliedRecord, behindHeldRecord],
  },
  files: [appliedFile, heldApprovalFile, behindHeldFile],
  readFile: heldReadFile,
});
assert.equal(approvalRecorded.database_schema_version, "0046");
assert.equal(
  approvalRecorded.migration_schema_after,
  `sha256:${"4".repeat(64)}`,
);

// A-23: when the highest applied file is a historical one past the
// baseline (an approval record recorded as history once applied), no
// fingerprint was captured for it: the release reports "unknown", never
// the baseline's fingerprint beside the later version.
const historyAtHead = classifyRelease(cssOnly, {
  ...base,
  manifest: {
    ...appliedManifest,
    historical: [[heldApprovalFile, sha256(heldApprovalSql)]],
    migrations: [appliedRecord],
  },
  files: [appliedFile, heldApprovalFile],
  readFile: heldReadFile,
});
assert.equal(historyAtHead.database_schema_version, "0045");
assert.equal(
  historyAtHead.migration_schema_after,
  "unknown",
  "A-23: a historical head with no captured fingerprint reads unknown",
);
assert.equal(historyAtHead.migration_schema_before, "unknown");
assert.notEqual(
  historyAtHead.migration_schema_after,
  appliedManifest.bootstrap.schema_fingerprint,
);

// A-23: without a verified ledger that applies automatic records, no record
// applies on its own, so the version stays at the baseline.
const unverifiedLedger = classifyRelease(cssOnly, {
  ...base,
  manifest: {
    ...safeManifest,
    bootstrap: {
      ...safeManifest.bootstrap,
      schema_fingerprint: `sha256:${"1".repeat(64)}`,
    },
  },
  files: [safeFile],
  readFile: () => safeSql,
});
assert.equal(unverifiedLedger.database_schema_version, "0042");
assert.equal(
  unverifiedLedger.migration_schema_after,
  `sha256:${"1".repeat(64)}`,
);

// A-23: the repository manifest reports the newest file on disk below its
// first held record. On 2026-09-22 that is 0044, production's d1_migrations
// head.
const repositoryManifest = loadManifest();
const firstHeldRecord = [...repositoryManifest.migrations]
  .sort((a, b) => a.file.localeCompare(b.file))
  .find((record) => record.risk !== "automatic");
const appliedOnDisk = readdirSync("drizzle/migrations")
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .filter((file) => !firstHeldRecord || file < firstHeldRecord.file)
  .sort()
  .at(-1)
  .slice(0, 4);
const repositoryRelease = classifyRelease(cssOnly, base);
assert.match(repositoryRelease.database_schema_version, /^\d{4}$/);
assert.equal(
  repositoryRelease.database_schema_version,
  appliedOnDisk,
  "the repository manifest reports its newest applied migration",
);

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

for (const path of [".gitignore", ".prettierignore"]) {
  const release = classifyRelease([`M\t${path}`], base);
  assert.equal(release.risk, "automatic");
  assert.equal(release.ci_policy_changed, true);
  assert.equal(Object.values(release.deploy_targets).some(Boolean), false);
}
// A knip config change is CI policy with no deploy; unknown would fail Classify and deploy.
const knipConfig = classifyRelease(["M\tknip.jsonc"], base);
assert.equal(knipConfig.risk, "automatic");
assert.equal(knipConfig.ci_policy_changed, true);
assert.equal(Object.values(knipConfig.deploy_targets).some(Boolean), false);
for (const path of ["knip.json", "knip.jsonc.bak", "config-knip.jsonc"]) {
  assert.equal(classifyRelease([`A\t${path}`], base).risk, "unknown", path);
}
const astryxPatch = classifyRelease(
  ["M\tpatches/@astryxdesign__core@0.4.6.patch"],
  base,
);
assert.equal(astryxPatch.risk, "automatic");
assert.equal(astryxPatch.ci_policy_changed, true);
assert.deepEqual(astryxPatch.deploy_targets, {
  www: false,
  admin: true,
  ingest: false,
  newsletter: false,
  state: false,
  weekly_email: false,
});
// Shared Astro build integrations change both app bundles.
for (const path of [
  "config/astro/advisory-guard.mjs",
  "config/astro/advisory-guard.test.mjs",
]) {
  const astroConfig = classifyRelease([`M\t${path}`], base);
  assert.notEqual(astroConfig.risk, "unknown", path);
  assert.equal(astroConfig.risk, "automatic", path);
  assert.equal(astroConfig.docs_only, false, path);
  assert.equal(astroConfig.ci_policy_changed, true, path);
  assert.deepEqual(
    astroConfig.deploy_targets,
    {
      www: true,
      admin: true,
      ingest: false,
      newsletter: false,
      state: false,
      weekly_email: false,
    },
    path,
  );
}
const typescriptConfig = classifyRelease(
  ["M\tconfig/typescript/base.json"],
  base,
);
assert.equal(typescriptConfig.deploy_targets.www, false);
assert.equal(typescriptConfig.deploy_targets.admin, false);
assert.equal(
  classifyRelease(["A\tconfig/astronomy/other.mjs"], base).deploy_targets.www,
  false,
);

for (const path of [
  "patches/@astryxdesign__core@0.4.7.patch",
  "patches/other.patch",
  ".gitignore-extra",
  ".prettierignore/other",
]) {
  assert.equal(classifyRelease([`A\t${path}`], base).risk, "unknown");
}

// Disabled public-store contracts require local replay, never a shared-DB apply.
for (const path of [
  "apps/admin/migrations/content-publication/0002_content_schema_version.sql",
  "packages/content/src/editorial/direct-publication.ts",
  "packages/content/src/editorial/publication-contract.ts",
  "scripts/ci/content-publication-migration-proof.mjs",
]) {
  const publication = classifyRelease([`M\t${path}`], base);
  assert.equal(publication.migration_preflight_required, true, path);
  assert.equal(publication.d1_changed, false, path);
  assert.equal(publication.remote_migration_allowed, false, path);
  assert.deepEqual(publication.migration_consumers, [], path);
}
