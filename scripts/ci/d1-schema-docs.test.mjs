#!/usr/bin/env node

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadManifest } from "./migration-policy.mjs";

const README_PATH = "drizzle/README.md";
const SCHEMA_PATH = "packages/lib/src/db/schema.ts";
const MIGRATION_DIR = "drizzle/migrations";
const MANIFEST_POINTER = "drizzle/migrations/manifest.json";
const CLASSES = ["live", "quarantined", "baseline", "unreferenced"];
const PRE_DRIZZLE = "pre-drizzle";

const ROW =
  /^\|\s*`([a-z0-9_]+)`\s*\|\s*(live|quarantined|baseline|unreferenced)\s*\|\s*([a-z0-9-]+)\s*\|/gm;
const SUMMARY_ROW =
  /^\|\s*(live|quarantined|baseline|unreferenced)\s*\|\s*(\d+)\s*\|/gm;
const TABLE_COUNT = /\b(\d+) (?:regular )?tables\b/g;
const MIGRATION_FILE = /\b\d{4}_[a-z0-9_]+\.sql\b/g;

const README_FORBIDDEN = [
  [/not applied|unapplied/i, "claims a recorded migration is unapplied"],
  [/wrangler d1 execute[^\n]*--remote/, "gives a manual remote D1 command"],
  [/session 2b/i, "hands applies to a session instead of deploy.yml"],
  [/canonical schema source/i, "calls schema.ts the canonical source"],
];

const HEADER_FORBIDDEN = [
  [/THE canonical|canonical schema source/i, "reclaims canonical authority"],
  [/never auto-run|applied manually/i, "says migrations are applied by hand"],
];

function sqlWithoutComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

function createdTables(migrationSql) {
  const created = new Map();
  for (const file of Object.keys(migrationSql).sort()) {
    const body = sqlWithoutComments(migrationSql[file]);
    for (const match of body.matchAll(
      /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([a-z0-9_]+)"?/gi,
    )) {
      if (!created.has(match[1])) created.set(match[1], file);
    }
  }
  return created;
}

function findings({ readme, schema, manifest, migrationSql }) {
  const problems = [];
  const tables = [...schema.matchAll(/sqliteTable\(\s*"([a-z0-9_]+)"/g)].map(
    (match) => match[1],
  );
  const modeled = new Set(tables);
  const headerEnd = schema.startsWith("/**") ? schema.indexOf("*/") : -1;
  const header = headerEnd === -1 ? "" : schema.slice(0, headerEnd + 2);
  const created = createdTables(migrationSql);
  const recorded = new Set([
    ...manifest.historical.map(([file]) => file),
    ...manifest.migrations.map((record) => record.file),
  ]);

  for (const pointer of [MANIFEST_POINTER, "deploy.yml"]) {
    if (!readme.includes(pointer))
      problems.push(`readme: missing pointer to ${pointer}`);
  }
  if (!readme.includes(`models ${tables.length} tables`))
    problems.push(`readme: missing "models ${tables.length} tables"`);

  const rows = new Map();
  for (const [, name, kind, origin] of readme.matchAll(ROW)) {
    if (rows.has(name)) problems.push(`readme: duplicate row for ${name}`);
    rows.set(name, { kind, origin });
  }
  for (const name of tables) {
    if (!rows.has(name))
      problems.push(`readme: no classification row for ${name}`);
  }
  for (const [name, { origin }] of rows) {
    if (!modeled.has(name)) {
      problems.push(`readme: classification row for unmodeled table ${name}`);
      continue;
    }
    const file = created.get(name);
    if (origin === PRE_DRIZZLE) {
      if (file) problems.push(`readme: ${name} is created by ${file}`);
    } else if (!file || !file.startsWith(`${origin}_`)) {
      problems.push(
        `readme: ${name} origin ${origin} disagrees with migrations`,
      );
    }
  }
  if (rows.size !== tables.length)
    problems.push(`readme: ${rows.size} rows for ${tables.length} tables`);

  const classCounts = Object.fromEntries(CLASSES.map((kind) => [kind, 0]));
  for (const { kind } of rows.values()) classCounts[kind] += 1;
  const summary = new Map();
  for (const [, kind, count] of readme.matchAll(SUMMARY_ROW))
    summary.set(kind, Number(count));
  for (const kind of CLASSES) {
    if (summary.get(kind) !== classCounts[kind])
      problems.push(
        `readme: ${kind} count ${summary.get(kind)} disagrees with ${classCounts[kind]} rows`,
      );
  }

  const preDrizzle = tables.filter((name) => !created.has(name)).length;
  const allowedCounts = new Set([
    tables.length,
    manifest.bootstrap.schema_objects.tables,
    preDrizzle,
    tables.length - preDrizzle,
  ]);
  for (const [phrase, count] of readme.matchAll(TABLE_COUNT)) {
    if (!allowedCounts.has(Number(count)))
      problems.push(`readme: "${phrase}" matches no schema or manifest count`);
  }

  for (const [pattern, reason] of README_FORBIDDEN) {
    if (pattern.test(readme)) problems.push(`readme: ${reason}`);
  }
  for (const [file] of readme.matchAll(MIGRATION_FILE)) {
    if (!recorded.has(file))
      problems.push(`readme: ${file} is not in the manifest`);
  }

  if (!header) problems.push("schema: missing header block comment");
  for (const [pattern, reason] of HEADER_FORBIDDEN) {
    if (pattern.test(header)) problems.push(`schema header: ${reason}`);
  }
  if (!header.includes("manifest.json"))
    problems.push("schema header: missing pointer to manifest.json");
  if (/services-platform/.test(schema))
    problems.push("schema: credits the removed services-platform package");
  for (const name of created.keys()) {
    if (!modeled.has(name) && !header.includes(name))
      problems.push(`schema header: does not name unmodeled table ${name}`);
  }

  return problems;
}

function readMigrationSql() {
  const migrationSql = {};
  for (const file of readdirSync(MIGRATION_DIR)) {
    if (/^\d{4}_.+\.sql$/.test(file))
      migrationSql[file] = readFileSync(join(MIGRATION_DIR, file), "utf8");
  }
  return migrationSql;
}

const real = {
  readme: readFileSync(README_PATH, "utf8"),
  schema: readFileSync(SCHEMA_PATH, "utf8"),
  manifest: loadManifest(),
  migrationSql: readMigrationSql(),
};

assert.deepEqual(findings(real), []);

const tableCount = [...real.schema.matchAll(/sqliteTable\(\s*"([a-z0-9_]+)"/g)]
  .length;
const countPhrase = `models ${tableCount} tables`;
assert.ok(real.readme.includes(countPhrase));
const firstRow = real.readme.match(/^\|\s*`[a-z0-9_]+`\s*\|.*\n/m);
assert.ok(firstRow);
const headerEnd = real.schema.indexOf("*/");
const withHeader = (edit) =>
  edit(real.schema.slice(0, headerEnd)) + real.schema.slice(headerEnd);

const mutations = [
  [
    "readme table count reverted",
    { readme: real.readme.replace(countPhrase, "models 23 tables") },
    /models \d+ tables|matches no schema/,
  ],
  [
    "readme says a recorded migration is unapplied",
    { readme: `${real.readme}\n0003_reconcile.sql is NOT applied.\n` },
    /unapplied/,
  ],
  [
    "readme restores the manual remote apply",
    {
      readme: `${real.readme}\nwrangler d1 execute anipotts-db --remote --file=drizzle/migrations/0001_service_registry.sql\n`,
    },
    /manual remote D1 command/,
  ],
  [
    "readme restores session 2b",
    { readme: `${real.readme}\nSession 2b reviews and applies.\n` },
    /session/,
  ],
  [
    "readme drops the manifest pointer",
    { readme: real.readme.replaceAll(MANIFEST_POINTER, "the manifest") },
    /missing pointer/,
  ],
  [
    "readme drops a classification row",
    { readme: real.readme.replace(firstRow[0], "") },
    /no classification row/,
  ],
  [
    "readme names a migration the manifest lacks",
    { readme: `${real.readme}\nsee 0099_invented.sql\n` },
    /not in the manifest/,
  ],
  [
    "readme gives a migration-created table a pre-drizzle origin",
    {
      readme: real.readme.replace(
        /^(\|\s*`service_registry`\s*\|\s*\w+\s*\|\s*)0001(\s*\|)/m,
        `$1${PRE_DRIZZLE}$2`,
      ),
    },
    /service_registry is created by/,
  ],
  [
    "readme class summary drifts",
    {
      readme: real.readme.replace(
        /^(\|\s*live\s*\|\s*)\d+/m,
        (_, prefix) => `${prefix}99`,
      ),
    },
    /live count/,
  ],
  [
    "schema header reclaims canonical authority",
    {
      schema: withHeader((head) => `${head} * THE canonical schema source.\n`),
    },
    /canonical authority/,
  ],
  [
    "schema header says never auto-run",
    {
      schema: withHeader(
        (head) =>
          `${head} * Applied via wrangler d1 execute, never auto-run.\n`,
      ),
    },
    /applied by hand/,
  ],
  [
    "schema credits services-platform",
    {
      schema: `${real.schema}\n// First table authored via @anipotts/services-platform.\n`,
    },
    /services-platform/,
  ],
  [
    "schema header forgets admin_proof_events",
    {
      schema: withHeader((head) =>
        head.replaceAll("admin_proof_events", "a proof table"),
      ),
    },
    /unmodeled table admin_proof_events/,
  ],
  [
    "schema gains a table the readme does not classify",
    {
      schema: `${real.schema}\nexport const extra = sqliteTable("extra_table", {});\n`,
    },
    /no classification row for extra_table/,
  ],
];

for (const [label, overrides, expected] of mutations) {
  const result = findings({ ...real, ...overrides });
  assert.ok(
    result.some((problem) => expected.test(problem)),
    `${label}: expected a finding matching ${expected}, got ${JSON.stringify(result)}`,
  );
}

console.log("D1 schema docs tests passed");
