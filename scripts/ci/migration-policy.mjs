#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const MANIFEST_PATH = "drizzle/migrations/manifest.json";
const MIGRATION_DIR = "drizzle/migrations";

export function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function sqlWithoutComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

export function classifySql(sql) {
  const body = sqlWithoutComments(sql);
  const unsafe = [
    /\bDROP\b/i,
    /\bDELETE\s+FROM\b/i,
    /\bTRUNCATE\b/i,
    /\bUPDATE\b/i,
    /\bREPLACE\s+INTO\b/i,
    /\bALTER\s+TABLE\b(?![\s\S]*\bADD\s+COLUMN\b)/i,
    /\bCREATE\s+TRIGGER\b/i,
    /\bPRAGMA\b/i,
  ];
  if (unsafe.some((pattern) => pattern.test(body))) return "approval";

  const statements = body
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  if (statements.length === 0) return "unknown";
  const safe = statements.every((statement) =>
    /^(?:CREATE\s+(?:UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS|CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS|ALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN|INSERT\s+OR\s+IGNORE\s+INTO)\b/i.test(
      statement,
    ),
  );
  return safe ? "automatic" : "unknown";
}

export function loadManifest(readFile = readFileSync) {
  return JSON.parse(readFile(MANIFEST_PATH, "utf8"));
}

export function verifyManifest(options = {}) {
  const readFile = options.readFile || readFileSync;
  const manifest = options.manifest || loadManifest(readFile);
  const listed = new Map(manifest.historical);
  const future = new Set(manifest.migrations.map((record) => record.file));
  const actualFiles = (options.files || readdirSync(MIGRATION_DIR))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();

  if (listed.size + future.size !== actualFiles.length) {
    throw new Error(
      "historical migration inventory does not match the manifest",
    );
  }
  for (const file of actualFiles) {
    if (future.has(file)) continue;
    const expected = listed.get(file);
    if (!expected)
      throw new Error(`historical migration is unrecorded: ${file}`);
    const actual = sha256(readFile(join(MIGRATION_DIR, file)));
    if (actual !== expected) {
      throw new Error(`recorded migration was edited: ${file}`);
    }
  }
  return manifest;
}

function validateNewRecord(record, sql, file, bootstrap) {
  for (const field of [
    "checksum",
    "risk",
    "consumers",
    "preconditions",
    "postconditions",
    "rollback",
    "schema_fingerprint_before",
    "schema_fingerprint_after",
  ]) {
    if (!record?.[field] || record[field].length === 0) {
      throw new Error(`${file} is missing migration metadata: ${field}`);
    }
  }
  if (record.checksum !== `sha256:${sha256(sql)}`) {
    throw new Error(`${file} checksum does not match its manifest record`);
  }
  if (
    bootstrap.status === "verified" &&
    [
      record.schema_fingerprint_before,
      record.schema_fingerprint_after,
    ].includes("pending_bootstrap")
  ) {
    throw new Error(
      `${file} must pin schema fingerprints after bootstrap verification`,
    );
  }
  for (const field of [
    "schema_fingerprint_before",
    "schema_fingerprint_after",
  ]) {
    const value = record[field];
    const pendingBootstrap =
      bootstrap.status !== "verified" && value === "pending_bootstrap";
    if (!pendingBootstrap && !/^sha256:[0-9a-f]{64}$/.test(value)) {
      throw new Error(`${file} has an invalid ${field}`);
    }
  }
  const observed = classifySql(sql);
  if (record.risk === "automatic" && observed !== "automatic") {
    throw new Error(`${file} is not provably safe for automatic migration`);
  }
  if (!["automatic", "approval"].includes(record.risk)) {
    throw new Error(`${file} has an unknown migration risk`);
  }
  for (const phase of ["preconditions", "postconditions"]) {
    for (const condition of record[phase]) {
      if (
        typeof condition?.sql !== "string" ||
        !/^SELECT\b/i.test(condition.sql.trim()) ||
        !condition.expected ||
        typeof condition.expected !== "object" ||
        Array.isArray(condition.expected)
      ) {
        throw new Error(`${file} has an unsafe ${phase} record`);
      }
    }
  }
  return record;
}

// With no migration in the diff, production is at the highest migration it has
// applied. The bootstrap baseline and historical files are applied. A later
// record counts only if a release applies it on its own: an automatic record
// under a verified ledger with automatic apply, which applies in the release
// that adds it or stops that release. An approval record never auto-applies,
// and it holds every record after it, so the version stays below it until a
// reviewed manifest change moves it into historical, as 0043 was. A pinned
// after-fingerprint travels with the last applied record.
function appliedSchema(manifest) {
  const autoApplies =
    manifest.bootstrap.status === "verified" &&
    manifest.bootstrap.automatic_remote_apply === true;
  const records = [...manifest.migrations].sort((a, b) =>
    a.file.localeCompare(b.file),
  );
  const firstHeld = records.findIndex(
    (record) => !autoApplies || record.risk !== "automatic",
  );
  const applied = firstHeld === -1 ? records : records.slice(0, firstHeld);
  const latest = applied.at(-1);
  const file = [
    manifest.bootstrap.baseline_through,
    ...manifest.historical.map(([name]) => name),
    latest?.file,
  ]
    .filter(Boolean)
    .sort()
    .at(-1);
  const fingerprint =
    latest?.file === file &&
    /^sha256:[0-9a-f]{64}$/.test(latest.schema_fingerprint_after ?? "")
      ? latest.schema_fingerprint_after
      : manifest.bootstrap.schema_fingerprint;
  return { version: file.slice(0, 4), fingerprint };
}

export function inspectMigrationChanges(paths, options = {}) {
  const manifest = verifyManifest(options);
  const migrationFiles = paths
    .filter((path) => /^drizzle\/migrations\/\d{4}_.+\.sql$/.test(path))
    .map((path) => basename(path));
  if (migrationFiles.length === 0) {
    const schema = appliedSchema(manifest);
    return {
      changed: false,
      risk: "none",
      consumers: [],
      remoteAllowed: false,
      schemaVersion: schema.version,
      schemaFingerprintBefore: schema.fingerprint,
      schemaFingerprintAfter: schema.fingerprint,
      reasons: [],
    };
  }

  const historical = new Set(manifest.historical.map(([file]) => file));
  const records = new Map(
    manifest.migrations.map((record) => [record.file, record]),
  );
  const readFile = options.readFile || readFileSync;
  let risk = "automatic";
  const consumers = new Set();
  const changedRecords = new Set();

  for (const file of migrationFiles) {
    if (historical.has(file)) {
      verifyManifest({ ...options, manifest, readFile });
      throw new Error(`historical migration cannot be changed: ${file}`);
    }
    const sql = readFile(join(MIGRATION_DIR, file), "utf8");
    const record = validateNewRecord(
      records.get(file),
      sql,
      file,
      manifest.bootstrap,
    );
    changedRecords.add(record.file);
  }

  const pending = manifest.migrations
    .map((record) => {
      const sql = readFile(join(MIGRATION_DIR, record.file), "utf8");
      return validateNewRecord(record, sql, record.file, manifest.bootstrap);
    })
    .sort((a, b) => a.file.localeCompare(b.file));

  for (const record of pending) {
    if (record.risk === "approval") risk = "approval";
    record.consumers.forEach((consumer) => consumers.add(consumer));
  }

  const remoteAllowed =
    manifest.bootstrap.status === "verified" &&
    manifest.bootstrap.automatic_remote_apply === true &&
    risk === "automatic" &&
    pending.length > 0 &&
    pending.every((record) => record.risk === "automatic");
  const firstPending = pending[0];
  const lastPending = pending.at(-1);
  return {
    changed: true,
    risk,
    consumers: [...consumers].sort(),
    remoteAllowed,
    schemaVersion: lastPending.file.slice(0, 4),
    schemaFingerprintBefore: firstPending.schema_fingerprint_before,
    schemaFingerprintAfter: lastPending.schema_fingerprint_after,
    reasons: pending.map(
      (record) =>
        `${record.file}: ${record.risk}${changedRecords.has(record.file) ? " (changed)" : " (pending)"}`,
    ),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const manifest = verifyManifest();
    console.log(`bootstrap_status=${manifest.bootstrap.status}`);
    console.log(
      `automatic_remote_apply=${String(manifest.bootstrap.automatic_remote_apply)}`,
    );
    console.log(`historical_migrations=${manifest.historical.length}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
