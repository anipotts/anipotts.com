#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const MAX_JSON = 128 * 1024;
const MAX_FILE = 16 * 1024 * 1024;
const MAX_BYTES = 128 * 1024 * 1024;
const MAX_FILES = 1024;

// The binding name the bundled Admin and public Workers actually read
// (apps/*/wrangler.toml declare it, and the source reads env.DB). A bundle
// whose database is bound under any other name validates as isolated but is
// unreachable from the application it ships, so the preflight would attest to
// a configuration that cannot run. Isolation comes from the run-owned
// database_name/database_id and the PROTECTED set, not from this name.
const APPLICATION_D1_BINDING = "DB";
const HASH = /^[a-f0-9]{64}$/;
const PROTECTED = new Set([
  "anipotts-admin",
  "anipotts-www-astro",
  "anipotts-state",
  "anipotts-db",
  "anipotts-content",
  "anipotts-content-media",
  "newsletter-send",
  "a8aadf73-bbf4-447c-97db-cb3e50b4e26f",
  "2679fc97-e251-46b7-ad01-db8b9fe04e8d",
]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
class PreflightError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
function requireCheck(value, code) {
  if (!value) throw new PreflightError(code);
}
function keys(value, required, optional = []) {
  requireCheck(
    value && typeof value === "object" && !Array.isArray(value),
    "invalid_object",
  );
  requireCheck(
    required.every((key) => Object.hasOwn(value, key)) &&
      Object.keys(value).every((key) =>
        [...required, ...optional].includes(key),
      ),
    "unexpected_or_missing_key",
  );
}
function same(actual, expected, code) {
  requireCheck(isDeepStrictEqual(actual, expected), code);
}
function safeName(value) {
  requireCheck(
    typeof value === "string" && !PROTECTED.has(value.toLowerCase()),
    "protected_resource",
  );
}
function timestamp(value) {
  requireCheck(
    typeof value === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) &&
      new Date(value).toISOString() === value,
    "invalid_time",
  );
  return Date.parse(value);
}

/** Local structural proof only. Never creates resources or calls a provider. */
export function validateContentReleaseIsolation({
  bundleRoot,
  manifestPath,
  expectedManifestSha256,
  previousReceipt,
  now = new Date(),
}) {
  try {
    requireCheck(HASH.test(expectedManifestSha256), "invalid_expected_digest");
    const root = realpathSync(bundleRoot);
    requireCheck(lstatSync(root).isDirectory(), "invalid_bundle_root");
    let bytesRead = 0;
    const checked = new Map();
    function contained(path, base = root) {
      requireCheck(
        typeof path === "string" &&
          path.length > 0 &&
          path.length <= 240 &&
          !isAbsolute(path) &&
          !/[\\\u0000-\u001f\u007f]/.test(path),
        "invalid_path",
      );
      const target = resolve(base, path);
      const local = relative(root, target);
      requireCheck(
        local !== "" &&
          local !== ".." &&
          !local.startsWith(`..${sep}`) &&
          !isAbsolute(local),
        "path_outside_bundle",
      );
      let cursor = root;
      for (const part of local.split(sep)) {
        cursor = join(cursor, part);
        requireCheck(
          !lstatSync(cursor).isSymbolicLink(),
          "symlink_not_allowed",
        );
      }
      return target;
    }
    function read(path, limit = MAX_FILE) {
      const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = fstatSync(fd);
        requireCheck(info.isFile() && info.size <= limit, "file_limit");
        const content = Buffer.alloc(info.size + 1);
        let size = 0;
        let count;
        while (
          size < content.length &&
          (count = readSync(fd, content, size, content.length - size, null))
        )
          size += count;
        requireCheck(size === info.size, "file_changed_during_read");
        bytesRead += size;
        requireCheck(bytesRead <= MAX_BYTES, "bundle_limit");
        return content.subarray(0, size);
      } finally {
        closeSync(fd);
      }
    }
    function json(bytes) {
      try {
        return JSON.parse(bytes.toString("utf8"));
      } catch {
        throw new PreflightError("invalid_json");
      }
    }
    const manifestBytes = read(contained(manifestPath), MAX_JSON);
    requireCheck(
      hash(manifestBytes) === expectedManifestSha256,
      "manifest_digest_mismatch",
    );
    const manifest = json(manifestBytes);
    keys(manifest, [
      "schemaVersion",
      "environment",
      "dataClass",
      "runId",
      "owner",
      "pr",
      "sourceSha",
      "createdAt",
      "expiresAt",
      "accountId",
      "resources",
      "files",
    ]);
    requireCheck(
      manifest.schemaVersion === 1 &&
        manifest.environment === "temporary-cloud-release-test" &&
        manifest.dataClass === "synthetic",
      "invalid_environment",
    );
    requireCheck(
      Number.isSafeInteger(manifest.pr) &&
        manifest.pr > 0 &&
        manifest.pr <= 999999 &&
        new RegExp(`^qp-${manifest.pr}-[a-z0-9]{8}$`).test(manifest.runId) &&
        /^codex\/[a-z0-9][a-z0-9/_-]{0,95}$/.test(manifest.owner),
      "invalid_ownership",
    );
    requireCheck(
      /^[a-f0-9]{40}$/.test(manifest.sourceSha) &&
        /^[a-f0-9]{32}$/.test(manifest.accountId) &&
        !/^0+$/.test(manifest.accountId),
      "invalid_identity",
    );
    const created = timestamp(manifest.createdAt);
    const expires = timestamp(manifest.expiresAt);
    requireCheck(
      Number.isFinite(+now) &&
        created <= +now &&
        expires > +now &&
        expires > created &&
        expires - created <= 24 * 60 * 60 * 1000,
      "expired_or_invalid_window",
    );
    keys(manifest.resources, ["databaseName", "databaseId", "mediaBucket"]);
    const resources = manifest.resources;
    for (const value of Object.values(resources)) safeName(value);
    requireCheck(
      resources.databaseName === `${manifest.runId}-content` &&
        resources.mediaBucket === `${manifest.runId}-media`,
      "resource_not_run_owned",
    );
    requireCheck(
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        resources.databaseId,
      ),
      "invalid_database_id",
    );
    keys(manifest.files, [
      "adminConfig",
      "wwwConfig",
      "artifacts",
      "migrations",
      "fixture",
    ]);
    requireCheck(
      Array.isArray(manifest.files.artifacts) &&
        manifest.files.artifacts.length >= 2 &&
        manifest.files.artifacts.length <= MAX_FILES,
      "artifact_limit",
    );
    function checkFile(ref, limit = MAX_FILE) {
      keys(ref, ["path", "sha256"]);
      requireCheck(HASH.test(ref.sha256), "invalid_file_digest");
      const path = contained(ref.path);
      requireCheck(!checked.has(path), "duplicate_file");
      const content = read(path, limit);
      requireCheck(hash(content) === ref.sha256, "file_digest_mismatch");
      checked.set(path, ref.sha256);
      return { path, content };
    }
    const artifacts = new Set(
      manifest.files.artifacts.map((ref) => checkFile(ref).path),
    );
    requireCheck(
      Array.isArray(manifest.files.migrations) &&
        manifest.files.migrations.length > 0 &&
        manifest.files.migrations.length <= 16,
      "migration_limit",
    );
    let previousOrdinal = -1;
    const migrations = manifest.files.migrations.map((ref) => {
      const migration = checkFile(ref, MAX_JSON);
      const filename = relative(dirname(migration.path), migration.path);
      requireCheck(
        /^\d{4}_[a-z0-9_]+\.sql$/.test(filename),
        "invalid_migration_file",
      );
      const ordinal = Number(filename.slice(0, 4));
      requireCheck(ordinal > previousOrdinal, "invalid_migration_order");
      previousOrdinal = ordinal;
      return migration;
    });
    const fixture = json(checkFile(manifest.files.fixture, MAX_JSON).content);
    keys(fixture, ["schemaVersion", "runId", "dataClass", "records"]);
    requireCheck(
      fixture.schemaVersion === 1 &&
        fixture.runId === manifest.runId &&
        fixture.dataClass === "synthetic" &&
        Array.isArray(fixture.records) &&
        fixture.records.length > 0 &&
        fixture.records.length <= 20,
      "fixture_identity_mismatch",
    );
    const recordIds = new Set();
    for (const record of fixture.records) {
      keys(record, ["id", "source"]);
      requireCheck(
        typeof record.id === "string" &&
          record.id.startsWith(`${manifest.runId}-fixture-`) &&
          /^[a-z0-9-]{1,96}$/.test(record.id) &&
          !recordIds.has(record.id) &&
          typeof record.source === "string" &&
          record.source.length > 0,
        "invalid_fixture_record",
      );
      recordIds.add(record.id);
    }
    // Labels establish fixture identity, not semantic proof that its text is non-private.
    const usedArtifacts = new Set();
    let entriesVisited = 0;
    function artifact(path) {
      requireCheck(artifacts.has(path), "unlisted_artifact");
      usedArtifacts.add(path);
    }
    function walk(directory, depth = 0) {
      requireCheck(depth <= 16, "artifact_depth_limit");
      const names = readdirSync(directory);
      entriesVisited += names.length;
      requireCheck(entriesVisited <= MAX_FILES * 2, "artifact_limit");
      for (const name of names) {
        const path = contained(name, directory);
        const info = lstatSync(path);
        if (info.isDirectory()) walk(path, depth + 1);
        else artifact(path);
      }
    }
    for (const role of ["admin", "www"]) {
      const { path, content } = checkFile(
        manifest.files[`${role}Config`],
        MAX_JSON,
      );
      const config = json(content);
      keys(
        config,
        [
          "name",
          "main",
          "base_dir",
          "no_bundle",
          "find_additional_modules",
          "account_id",
          "compatibility_date",
          "compatibility_flags",
          "workers_dev",
          "preview_urls",
          "routes",
          "vars",
          "d1_databases",
          "r2_buckets",
        ],
        role === "admin"
          ? ["assets", "durable_objects", "migrations"]
          : ["assets"],
      );
      safeName(config.name);
      requireCheck(
        config.name === `${manifest.runId}-${role}` &&
          config.account_id === manifest.accountId,
        "config_identity_mismatch",
      );
      requireCheck(
        config.compatibility_date === "2026-05-01",
        "compatibility_mismatch",
      );
      same(
        config.compatibility_flags,
        ["nodejs_compat"],
        "compatibility_mismatch",
      );
      requireCheck(
        typeof config.workers_dev === "boolean" &&
          config.preview_urls === false,
        "invalid_endpoint_policy",
      );
      same(config.routes, [], "routes_not_empty");
      keys(config.vars, [
        "RELEASE_TEST_RUN_ID",
        "RELEASE_TEST_DATA_CLASS",
        "EDITORIAL_PUBLISH_ENABLED",
      ]);
      requireCheck(
        config.vars.RELEASE_TEST_RUN_ID === manifest.runId &&
          config.vars.RELEASE_TEST_DATA_CLASS === "synthetic" &&
          config.vars.EDITORIAL_PUBLISH_ENABLED === "false",
        "unsafe_runtime_vars",
      );
      requireCheck(
        Array.isArray(config.d1_databases) && config.d1_databases.length === 1,
        "invalid_database_binding",
      );
      const db = config.d1_databases[0];
      keys(db, ["binding", "database_name", "database_id", "migrations_dir"]);
      safeName(db.database_id);
      safeName(db.database_name);
      requireCheck(
        db.binding === APPLICATION_D1_BINDING &&
          db.database_name === resources.databaseName &&
          db.database_id === resources.databaseId,
        "invalid_database_binding",
      );
      const migrationDirectory = contained(db.migrations_dir, dirname(path));
      requireCheck(
        migrations.every(
          (migration) => dirname(migration.path) === migrationDirectory,
        ) && lstatSync(migrationDirectory).isDirectory(),
        "migration_path_mismatch",
      );
      same(
        readdirSync(migrationDirectory).sort(),
        migrations.map((migration) =>
          relative(migrationDirectory, migration.path),
        ),
        "unreviewed_migration",
      );
      requireCheck(
        Array.isArray(config.r2_buckets) && config.r2_buckets.length === 1,
        "invalid_media_binding",
      );
      const bucket = config.r2_buckets[0];
      keys(bucket, ["binding", "bucket_name"]);
      safeName(bucket.bucket_name);
      requireCheck(
        bucket.binding === "CONTENT_MEDIA" &&
          bucket.bucket_name === resources.mediaBucket,
        "invalid_media_binding",
      );
      if (role === "admin") {
        keys(config.durable_objects, ["bindings"]);
        same(
          config.durable_objects.bindings,
          [{ name: "EDITORIAL", class_name: "EditorialDraftStore" }],
          "unsafe_durable_binding",
        );
        same(
          config.migrations,
          [
            {
              tag: "editorial-v1",
              new_sqlite_classes: ["EditorialDraftStore"],
            },
          ],
          "unsafe_durable_migration",
        );
      }
      requireCheck(
        config.no_bundle === true && config.find_additional_modules === true,
        "prebuilt_modules_required",
      );
      const moduleDirectory = contained(config.base_dir, dirname(path));
      requireCheck(
        lstatSync(moduleDirectory).isDirectory(),
        "invalid_module_directory",
      );
      const main = contained(config.main, dirname(path));
      const entrypoint = relative(moduleDirectory, main);
      requireCheck(
        entrypoint !== "" &&
          entrypoint !== ".." &&
          !entrypoint.startsWith(`..${sep}`) &&
          !isAbsolute(entrypoint),
        "main_outside_module_directory",
      );
      artifact(main);
      walk(moduleDirectory);
      if (config.assets) {
        keys(config.assets, ["binding", "directory", "run_worker_first"]);
        requireCheck(
          config.assets.binding === "ASSETS" &&
            config.assets.run_worker_first === true,
          "invalid_assets",
        );
        const directory = contained(config.assets.directory, dirname(path));
        requireCheck(lstatSync(directory).isDirectory(), "invalid_assets");
        walk(directory);
      }
    }
    requireCheck(usedArtifacts.size === artifacts.size, "unused_artifact");
    const bundleSha256 = hash(
      JSON.stringify(
        [...checked]
          .map(([path, digest]) => [relative(root, path), digest])
          .sort(),
      ),
    );
    if (previousReceipt !== undefined) {
      requireCheck(
        previousReceipt?.schemaVersion === 1 &&
          previousReceipt?.status === "configuration-only" &&
          previousReceipt?.manifestSha256 === expectedManifestSha256 &&
          previousReceipt?.bundleSha256 === bundleSha256,
        "receipt_mismatch",
      );
    }
    return {
      schemaVersion: 1,
      status: "configuration-only",
      runId: manifest.runId,
      owner: manifest.owner,
      pr: manifest.pr,
      environment: manifest.environment,
      expiresAt: manifest.expiresAt,
      manifestSha256: expectedManifestSha256,
      bundleSha256,
      assertedSourceSha: manifest.sourceSha,
      artifactProvenanceVerified: false,
      moduleClosureVerified: false,
      syntheticContentVerified: false,
      ownerApprovalVerified: false,
      providerOwnershipVerified: false,
      cloudRuntimeVerified: false,
      mutationAuthorized: false,
      requiredGates: [
        "reviewed-synthetic-fixtures",
        "owner-pr-review",
        "artifact-provenance",
        "prebuilt-module-validation",
        "provider-resource-identity",
        "real-cloud-runtime-proof",
      ],
    };
  } catch (error) {
    throw new PreflightError(
      error instanceof PreflightError ? error.code : "unreadable_bundle",
    );
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  try {
    const args = process.argv.slice(2);
    requireCheck(
      args.length === 6 &&
        args[0] === "--bundle-root" &&
        args[2] === "--manifest" &&
        args[4] === "--manifest-sha256",
      "usage",
    );
    console.log(
      JSON.stringify(
        validateContentReleaseIsolation({
          bundleRoot: args[1],
          manifestPath: args[3],
          expectedManifestSha256: args[5],
        }),
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify({ ok: false, code: error.code || "preflight_failed" }),
    );
    process.exitCode = 1;
  }
}
