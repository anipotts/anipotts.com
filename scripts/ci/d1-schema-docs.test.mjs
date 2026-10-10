#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { parse } from "yaml";
import { loadManifest } from "./migration-policy.mjs";

const README_PATH = "drizzle/README.md";
const SCHEMA_PATH = "packages/lib/src/db/schema.ts";
const MIGRATION_DIR = "drizzle/migrations";
const MANIFEST_POINTER = "drizzle/migrations/manifest.json";
const SOURCE_ROOTS = ["apps", "workers"];
const CLASSES = ["live", "quarantined", "baseline", "unreferenced"];
const PRE_DRIZZLE = "pre-drizzle";

const ROW =
  /^\|\s*`([a-z0-9_]+)`\s*\|\s*(live|quarantined|baseline|unreferenced)\s*\|\s*([a-z0-9-]+)\s*\|([^|\n]*)\|\s*$/gm;
const SUMMARY_ROW =
  /^\|\s*(live|quarantined|baseline|unreferenced)\s*\|\s*(\d+)\s*\|/gm;
const TABLE_COUNT = /\b(\d+) (?:regular )?tables\b/g;
const MIGRATION_FILE = /\b\d{4}_[a-z0-9_]+\.sql\b/g;
const MIGRATION_CITATION = /\b(\d{4}_[a-z0-9_]+\.sql):(\d+)(?:-(\d+))?/g;
const DOC_CITATION = /\bdocs\/[a-z0-9/_-]+\.md\b/g;

// CREATE [TEMP | TEMPORARY | VIRTUAL] TABLE [IF NOT EXISTS] name. VIRTUAL
// covers fts5 tables such as thoughts_fts in 0003_reconcile.sql.
const CREATE_TABLE =
  /\bCREATE\s+(?:(?:TEMP|TEMPORARY|VIRTUAL)\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?([a-z0-9_]+)/gi;

// Deployed sql matching rule. A source file is deployed when it sits under
// apps/*/src or workers/*/src, has a script or astro extension, and is not a
// test or fixture: no *.test.* or *.spec.* name, no test, tests, __tests__,
// fixture, fixtures or __fixtures__ directory, and no "fixture" in its name.
// A table is referenced when a SQL keyword is followed by whitespace, an
// optional quote and the whole table identifier in a source string or template
// literal. TypeScript's existing parser excludes code comments; keyword case
// is ignored, as in SQLite. Recognizable SQL statements exclude prose; SQL
// comments and single-quoted values are masked. Template expressions keep a
// placeholder between pieces so a dynamic table name cannot be invented.
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|astro)$/;
const NOT_DEPLOYED =
  /\.(?:test|spec)\.|(?:^|\/)(?:test|tests|__tests__|fixtures?|__fixtures__)\/|fixture[^/]*$/i;
const SQL_STATEMENT =
  /^\s*(?:SELECT|INSERT|UPDATE|DELETE|REPLACE|CREATE|ALTER|DROP|WITH|PRAGMA)\b/i;
const SQL_REFERENCE =
  /\b(?:FROM|INTO|UPDATE|JOIN|TABLE|EXISTS)\s+[`"[]?([A-Za-z0-9_]+)\b/gi;

// Quarantine sources. A migration line that comments out a DROP TABLE marks
// that table dead. So does a paragraph or table row of a doc the readme
// cites, when it says "quarantined" and names the table in backticks.
const COMMENTED_DROP =
  /^\s*--\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?[`"[]?([a-z0-9_]+)/gim;
const QUARANTINED = /\bquarantined\b/i;

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

const namesTable = (text, name) => new RegExp(`\\b${name}\\b`).test(text);

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
    for (const match of body.matchAll(CREATE_TABLE)) {
      if (!created.has(match[1])) created.set(match[1], file);
    }
  }
  return created;
}

function isDeployedSource(path) {
  return SOURCE_EXT.test(path) && !NOT_DEPLOYED.test(path);
}

function deployedSourceFile(path, text) {
  // Astro server code lives in frontmatter. Keeping its opening line as
  // whitespace preserves source line numbers and excludes HTML prose.
  const code = path.endsWith(".astro")
    ? (text.match(/^---[^\S\r\n]*\r?\n[\s\S]*?\r?\n---/)?.[0] ?? "").replace(
        /^---|---$/g,
        "   ",
      )
    : text;
  return ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true);
}

function deployedReferences(sources, tables) {
  const references = new Map();
  for (const path of Object.keys(sources).sort()) {
    if (!isDeployedSource(path)) continue;
    const source = deployedSourceFile(path, sources[path]);
    const visit = (node) => {
      if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) {
        const literal = ts.isTemplateExpression(node)
          ? node.head.text +
            node.templateSpans
              .map((span) => ` __dynamic_sql_expression__ ${span.literal.text}`)
              .join("")
          : node.text;
        // SQLite strings escape apostrophes by doubling them. Mask them
        // before line comments, so a value containing '--' stays a value.
        const sql = literal.replace(
          /'(?:''|[^'])*'|--[^\r\n]*|\/\*[\s\S]*?\*\//g,
          (part) => part.replace(/[^\r\n]/g, " "),
        );
        if (SQL_STATEMENT.test(sql))
          for (const match of sql.matchAll(SQL_REFERENCE)) {
            const name = match[1].toLowerCase();
            if (!tables.has(name) || references.has(name)) continue;
            const line =
              source.getLineAndCharacterOfPosition(node.getStart(source)).line +
              1;
            references.set(name, `${path}:${line}`);
          }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return references;
}

function docBlocks(text) {
  return text
    .split(/\n\s*\n/)
    .flatMap((block) =>
      block.trimStart().startsWith("|") ? block.split("\n") : [block],
    );
}

function quarantineSources({ migrationSql, docs }) {
  const sources = new Map();
  const add = (name, source) => {
    if (!sources.has(name)) sources.set(name, new Set());
    sources.get(name).add(source);
  };
  for (const file of Object.keys(migrationSql).sort()) {
    for (const [, name] of migrationSql[file].matchAll(COMMENTED_DROP))
      add(name, file);
  }
  for (const path of Object.keys(docs).sort()) {
    for (const block of docBlocks(docs[path])) {
      if (!QUARANTINED.test(block)) continue;
      for (const [, name] of block.matchAll(/`([a-z0-9_]+)`/g)) add(name, path);
    }
  }
  return sources;
}

function section(markdown, heading) {
  const start = markdown.indexOf(`\n## ${heading}\n`);
  if (start === -1) return "";
  const end = markdown.indexOf("\n## ", start + 1);
  return markdown.slice(start, end === -1 ? undefined : end);
}

function manifestFindings(readme, manifest) {
  const problems = [];
  const historical = manifest.historical.map(([file]) => file).sort();
  const first = historical[0].slice(0, 4);
  const last = historical.at(-1).slice(0, 4);
  const stated = readme.match(
    /`historical` lists (\d+) applied files, (\d{4}) through (\d{4})/,
  );
  if (!stated) {
    problems.push("readme: missing the stated historical count and range");
  } else if (
    Number(stated[1]) !== historical.length ||
    stated[2] !== first ||
    stated[3] !== last
  ) {
    problems.push(
      `readme: states ${stated[1]} historical files ${stated[2]}-${stated[3]}, manifest has ${historical.length} files ${first}-${last}`,
    );
  }

  const numbers = new Set(historical.map((file) => Number(file.slice(0, 4))));
  const unused = [];
  for (let n = Number(first); n <= Number(last); n += 1) {
    if (!numbers.has(n)) unused.push(String(n).padStart(4, "0"));
  }
  const unusedPhrase = readme.match(
    /\bnumbers? ((?:\d{4}(?:,? and |, )?)+) (?:is|are) unused/,
  );
  const statedUnused = unusedPhrase ? unusedPhrase[1].match(/\d{4}/g) : [];
  if (statedUnused.join() !== unused.join())
    problems.push(
      `readme: states unused numbers [${statedUnused}], manifest skips [${unused}]`,
    );

  const baseline = manifest.bootstrap.baseline_through;
  if (!readme.includes(`\`baseline_through\` set to \`${baseline}\``))
    problems.push(`readme: does not state baseline_through ${baseline}`);

  const applied = section(readme, "applied state");
  if (!applied) {
    problems.push("readme: missing the applied state section");
    return problems;
  }
  const ledgerNames = historical.filter((file) => file < baseline).length;
  const ledger = applied.match(/\brecorded (\d+) names\b/);
  if (!ledger || Number(ledger[1]) !== ledgerNames)
    problems.push(
      `readme: applied state ledger count ${ledger?.[1]} disagrees with ${ledgerNames} historical files before ${baseline}`,
    );
  for (const { file } of manifest.migrations) {
    if (!applied.includes(file))
      problems.push(
        `readme: applied state does not document manifest record ${file}`,
      );
  }
  const records = applied.match(/`migrations` holds (\d+) records?\b/);
  if (!records || Number(records[1]) !== manifest.migrations.length)
    problems.push(
      `readme: applied state migrations count ${records?.[1]} disagrees with ${manifest.migrations.length} manifest records`,
    );
  return problems;
}

function classFindings({ rows, modeled, migrationSql, sources, docs }) {
  const problems = [];
  const referenced = deployedReferences(sources, modeled);
  const quarantine = quarantineSources({ migrationSql, docs });

  for (const [name, { kind, origin, evidence }] of rows) {
    if (!modeled.has(name)) continue;

    for (const [, file, from, to] of evidence.matchAll(MIGRATION_CITATION)) {
      const lines = (migrationSql[file] ?? "")
        .split(/\r?\n/)
        .slice(Number(from) - 1, Number(to ?? from));
      if (!namesTable(lines.join("\n"), name))
        problems.push(
          `readme: ${name} cites ${file}:${from}${to ? `-${to}` : ""}, which does not name it`,
        );
    }

    const reference = referenced.get(name);
    if (kind === "live") {
      if (!reference)
        problems.push(
          `readme: ${name} is live but no deployed sql references it`,
        );
      continue;
    }
    if (reference)
      problems.push(
        `readme: ${name} is ${kind} but deployed sql references it at ${reference}`,
      );

    const marks = [...(quarantine.get(name) ?? [])];
    if (kind === "quarantined") {
      if (marks.length === 0)
        problems.push(
          `readme: ${name} is quarantined but no migration comment or quarantine doc marks it`,
        );
      else if (!marks.some((source) => evidence.includes(source)))
        problems.push(
          `readme: ${name} evidence cites none of its quarantine sources (${marks.join(", ")})`,
        );
      continue;
    }
    if (marks.length > 0)
      problems.push(
        `readme: ${name} is ${kind} but ${marks[0]} quarantines it`,
      );
    if (kind === "baseline" && origin !== PRE_DRIZZLE)
      problems.push(`readme: ${name} is baseline but ${origin} creates it`);
    if (kind === "unreferenced" && origin === PRE_DRIZZLE)
      problems.push(`readme: ${name} is unreferenced but predates drizzle`);
  }
  return problems;
}

function findings({
  readme,
  schema,
  manifest,
  migrationSql,
  sources,
  docs,
  knip,
}) {
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
  for (const [, name, kind, origin, evidence] of readme.matchAll(ROW)) {
    if (rows.has(name)) problems.push(`readme: duplicate row for ${name}`);
    rows.set(name, { kind, origin, evidence: evidence.trim() });
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
  problems.push(
    ...classFindings({ rows, modeled, migrationSql, sources, docs }),
  );

  const preDrizzle = tables.filter((name) => !created.has(name)).length;
  for (const [pattern, expected, meaning] of [
    [/\b(\d+) tables predate drizzle\b/, preDrizzle, "pre-drizzle"],
    [
      /\b(\d+) tables come from migrations in this directory\b/,
      tables.length - preDrizzle,
      "migration-created",
    ],
    [
      /\bmanifest's (\d+) tables\b/,
      manifest.bootstrap.schema_objects.tables,
      "bootstrap",
    ],
  ]) {
    const count = readme.match(pattern)?.[1];
    if (Number(count) !== expected)
      problems.push(
        `readme: ${meaning} prose count ${count} disagrees with ${expected}`,
      );
  }
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
  problems.push(...manifestFindings(readme, manifest));

  if (!header) problems.push("schema: missing header block comment");
  for (const [pattern, reason] of HEADER_FORBIDDEN) {
    if (pattern.test(header)) problems.push(`schema header: ${reason}`);
  }
  if (!header.includes("manifest.json"))
    problems.push("schema header: missing pointer to manifest.json");
  if (/canonical schema/i.test(knip))
    problems.push("knip: still claims canonical schema authority");
  if (/services-platform/.test(schema))
    problems.push("schema: credits the removed services-platform package");
  const unmodeledEntries = header.split(/^\s*\*\s+-\s+/m).slice(1);
  for (const [name, file] of created) {
    if (modeled.has(name)) continue;
    if (!namesTable(header, name))
      problems.push(
        `schema header: does not name unmodeled table ${name} (${file})`,
      );
    if (
      !unmodeledEntries.some(
        (entry) =>
          namesTable(entry, name) &&
          [
            ...entry.matchAll(
              /\bdrizzle\/migrations\/(\d{4}_[a-z0-9_]+\.sql)\b/g,
            ),
          ].some(([, origin]) => origin === file),
      )
    )
      problems.push(
        `schema header: unmodeled table ${name} must cite its creation migration ${file} in its own entry`,
      );
    if (!namesTable(readme, name))
      problems.push(`readme: does not name unmodeled table ${name} (${file})`);
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

function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules") walk(path, out);
    } else if (isDeployedSource(path)) {
      out[path] = readFileSync(path, "utf8");
    }
  }
  return out;
}

function readSources() {
  const sources = {};
  for (const root of SOURCE_ROOTS) {
    for (const pkg of readdirSync(root).sort()) {
      const src = join(root, pkg, "src");
      if (existsSync(src)) walk(src, sources);
    }
  }
  return sources;
}

function readDocs(readme) {
  const docs = {};
  for (const [path] of readme.matchAll(DOC_CITATION)) {
    if (!(path in docs) && existsSync(path))
      docs[path] = readFileSync(path, "utf8");
  }
  return docs;
}

const readmeText = readFileSync(README_PATH, "utf8");
const real = {
  readme: readmeText,
  schema: readFileSync(SCHEMA_PATH, "utf8"),
  manifest: loadManifest(),
  migrationSql: readMigrationSql(),
  sources: readSources(),
  docs: readDocs(readmeText),
  knip: readFileSync("knip.jsonc", "utf8"),
};

assert.deepEqual(findings(real), []);

// The parser sees the 0003 fts5 virtual table and its source file.
assert.equal(
  createdTables(real.migrationSql).get("thoughts_fts"),
  "0003_reconcile.sql",
);
assert.deepEqual(
  [
    ...createdTables({
      "0001_a.sql":
        'CREATE VIRTUAL TABLE IF NOT EXISTS "notes_fts" USING fts5(body);\n-- CREATE TABLE ghost (id);\nCREATE TEMP TABLE scratch (id);',
    }).keys(),
  ],
  ["notes_fts", "scratch"],
);

// The deployed SQL rule: whole identifier inside a SQL statement string
// or template literal, no comments, no tests or fixtures.
const prepared = 'db.prepare("SELECT * FROM rate_limits");';
assert.deepEqual(
  [
    ...deployedReferences(
      {
        "workers/a/src/index.ts": [
          'db.prepare("SELECT id FROM newsletter_events_archive");',
          "// TODO: DELETE FROM rate_limits once retired",
          '/* retired: db.prepare("SELECT * FROM rate_limits"), */',
          'const note = "rows imported from rate_limits";',
          'const url = "https://example.com/a"; // FROM rate_limits',
          "const half = total / 2; // FROM rate_limits",
          'db.prepare(`INSERT OR IGNORE INTO "email_queue" (id) VALUES (${id})`);',
        ].join("\n"),
        "workers/a/src/index.test.ts": prepared,
        "apps/b/src/fixtures/rows.ts": prepared,
        "apps/b/src/lib/data-fixture-reader.ts": prepared,
        "apps/b/src/test/helpers.ts": prepared,
        "apps/b/src/styles/site.css": prepared,
      },
      new Set(["newsletter_events", "rate_limits", "email_queue"]),
    ),
  ],
  [["email_queue", "workers/a/src/index.ts:7"]],
);

// The TypeScript parser keeps its place past regex literals, divisions, ${}
// substitutions with nested strings, escapes and a quoted string cut off by
// its line end. Misreading any of them hides a later query.
assert.deepEqual(
  [
    ...deployedReferences(
      {
        "workers/a/src/index.ts": [
          "const quotes = /[`\"']/g; const slash = /\\//;",
          "const label = 'it\\'s fine';",
          "const broken = 'unterminated",
          'db.prepare(`SELECT ${ids.map(() => "?").join(", ")} AS ids FROM newsletter_events`);',
          'return /"/.test(x) ? db.prepare("SELECT * FROM email_queue") : null;',
          'const half = total / 2; db.prepare("DELETE FROM rate_limits"); const third = n / 3;',
        ].join("\n"),
      },
      new Set(["newsletter_events", "email_queue", "rate_limits"]),
    ),
  ],
  [
    ["newsletter_events", "workers/a/src/index.ts:4"],
    ["email_queue", "workers/a/src/index.ts:5"],
    ["rate_limits", "workers/a/src/index.ts:6"],
  ],
);
assert.ok(
  Object.keys(real.sources).length > 0 &&
    Object.keys(real.sources).every(isDeployedSource),
);
// Every deployed source ends outside any template literal or block comment.
// TypeScript diagnostics preserve the upstream lexical-consumption proof
// without maintaining a second hand-written JavaScript tokenizer.
assert.deepEqual(
  Object.keys(real.sources).filter((path) =>
    deployedSourceFile(path, real.sources[path]).parseDiagnostics.some(
      (diagnostic) => [1010, 1160].includes(diagnostic.code),
    ),
  ),
  [],
);
assert.ok(Object.keys(real.docs).length > 0);

const tableCount = [...real.schema.matchAll(/sqliteTable\(\s*"([a-z0-9_]+)"/g)]
  .length;
const countPhrase = `models ${tableCount} tables`;
assert.ok(real.readme.includes(countPhrase));
const firstRow = real.readme.match(/^\|\s*`[a-z0-9_]+`\s*\|.*\n/m);
assert.ok(firstRow);
const headerEnd = real.schema.indexOf("*/");
const withHeader = (edit) =>
  edit(real.schema.slice(0, headerEnd)) + real.schema.slice(headerEnd);
const setRow = (readme, name, kind) => {
  const row = new RegExp(
    `^(\\|\\s*\`${name}\`\\s*\\|\\s*)[a-z]+(\\s*\\|)`,
    "m",
  );
  assert.match(readme, row);
  return readme.replace(row, `$1${kind}$2`);
};
const appliedState = section(real.readme, "applied state");
const recordLine = appliedState.match(/^- `migrations` holds .*\n/m);
assert.ok(recordLine);
const dataOnlyRecord = {
  ...real.manifest.migrations[0],
  file: "0045_seed_example_page_content.sql",
};

const weeklyEmail = "workers/weekly-email/src/index.ts";
const emailQueueQuery = real.sources[weeklyEmail]?.match(
  /"[^"\n]*\bFROM email_queue\b[^"\n]*"/,
);
assert.ok(emailQueueQuery, `${weeklyEmail} no longer queries email_queue`);
const retireEmailQueue = (wrap) => ({
  sources: {
    ...real.sources,
    [weeklyEmail]: real.sources[weeklyEmail].replace(
      emailQueueQuery[0],
      wrap(emailQueueQuery[0]),
    ),
  },
});

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

  [
    "readme swaps pre-drizzle and migration-created prose counts",
    {
      readme: real.readme.replace(
        "21 tables predate drizzle and 31 tables come from migrations",
        "31 tables predate drizzle and 21 tables come from migrations",
      ),
    },
    [
      /pre-drizzle prose count 31 disagrees with 21/,
      /migration-created prose count 21 disagrees with 31/,
    ],
  ],
  [
    "readme uses the modeled total for the bootstrap count",
    {
      readme: real.readme.replace(
        "manifest's 64 tables",
        "manifest's 52 tables",
      ),
    },
    /bootstrap prose count 52 disagrees with 64/,
  ],
  [
    "schema header gives admin_proof_events another table's origin",
    {
      schema: withHeader((head) =>
        head.replace(
          "0012_admin_proof_events.sql",
          "0001_service_registry.sql",
        ),
      ),
    },
    /unmodeled table admin_proof_events must cite its creation migration 0012_admin_proof_events\.sql/,
  ],
  [
    "schema header gives the virtual table another table's origin",
    {
      schema: withHeader((head) =>
        head.replace("0003_reconcile.sql", "0012_admin_proof_events.sql"),
      ),
    },
    /unmodeled table thoughts_fts must cite its creation migration 0003_reconcile\.sql/,
  ],

  [
    "lowercase deployed sql starts reading an unreferenced table",
    {
      sources: {
        ...real.sources,
        "workers/newsletter/src/preferences.ts":
          'db.prepare("select * from newsletter_preferences where subscriber_id = ?");',
      },
    },
    /newsletter_preferences is unreferenced but deployed sql references it/,
  ],
  [
    "deployed template sql after interpolation reads an unreferenced table",
    {
      sources: {
        ...real.sources,
        "workers/newsletter/src/preferences.ts":
          "db.prepare(`SELECT ${columns} FROM newsletter_preferences WHERE subscriber_id = ?`);",
      },
    },
    /newsletter_preferences is unreferenced but deployed sql references it/,
  ],

  [
    "Astro frontmatter reads an unreferenced table",
    {
      sources: {
        ...real.sources,
        "apps/www/src/pages/query.astro":
          '---\nconst query = db.prepare("select * from newsletter_preferences");\n---\n<p>Example</p>',
      },
    },
    /newsletter_preferences is unreferenced but deployed sql references it/,
  ],

  [
    "knip reclaims canonical schema authority",
    { knip: real.knip.replace("historical Drizzle model", "canonical schema") },
    /knip: still claims canonical schema authority/,
  ],

  // F1: CREATE VIRTUAL TABLE objects count as migration-created tables.
  [
    "schema header forgets the 0003 thoughts_fts virtual table",
    {
      schema: withHeader((head) =>
        head.replace(/\bthoughts_fts\b/g, "the fts index"),
      ),
    },
    /schema header: does not name unmodeled table thoughts_fts \(0003_reconcile\.sql\)/,
  ],
  [
    "readme forgets the 0003 thoughts_fts virtual table",
    { readme: real.readme.replace(/\bthoughts_fts\b/g, "fts") },
    /readme: does not name unmodeled table thoughts_fts/,
  ],
  [
    "a migration adds a virtual table nobody documents",
    {
      migrationSql: {
        ...real.migrationSql,
        "0045_notes_fts.sql":
          "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(body);\n",
      },
    },
    [
      /schema header: does not name unmodeled table notes_fts/,
      /readme: does not name unmodeled table notes_fts/,
    ],
  ],

  // F2: every manifest record is documented, or its stated count holds.
  [
    "manifest gains a data-only record the readme does not document",
    {
      manifest: {
        ...real.manifest,
        migrations: [...real.manifest.migrations, dataOnlyRecord],
      },
    },
    [
      /applied state does not document manifest record 0045_seed_example_page_content\.sql/,
      /migrations count 1 disagrees with 2 manifest records/,
    ],
  ],
  [
    "readme drops the applied state for 0044",
    { readme: real.readme.replace(recordLine[0], "") },
    /does not document manifest record 0044_copy_agents_project_page_content\.sql/,
  ],
  [
    "readme historical count drifts",
    {
      readme: real.readme.replace(
        /`historical` lists \d+/,
        "`historical` lists 40",
      ),
    },
    /states 40 historical files/,
  ],
  [
    "readme unused numbers drift",
    {
      readme: real.readme.replace(
        /numbers 0038 and 0039 are unused/,
        "number 0038 is unused",
      ),
    },
    /unused numbers \[0038\], manifest skips \[0038,0039\]/,
  ],
  [
    "manifest historical gains a file the readme range misses",
    {
      manifest: {
        ...real.manifest,
        historical: [...real.manifest.historical, ["0046_late.sql", "0"]],
      },
    },
    [
      /manifest has 42 files 0001-0046/,
      /manifest skips \[0038,0039,0044,0045\]/,
    ],
  ],
  [
    "readme ledger count drifts",
    { readme: real.readme.replace(/recorded \d+ names/, "recorded 41 names") },
    /ledger count 41 disagrees with 40/,
  ],
  [
    "readme baseline drifts",
    {
      readme: real.readme.replace(
        "`baseline_through` set to `0043_admin_auth_v2.sql`",
        "`baseline_through` set to `0037_admin_event_core.sql`",
      ),
    },
    /does not state baseline_through 0043_admin_auth_v2\.sql/,
  ],

  // F3: each row's class agrees with deployed sql and quarantine sources.
  [
    "readme swaps email_queue and newsletter_preferences classes",
    {
      readme: setRow(
        setRow(real.readme, "email_queue", "unreferenced"),
        "newsletter_preferences",
        "live",
      ),
    },
    [
      /email_queue is unreferenced but deployed sql references it at workers\/weekly-email\/src\//,
      /email_queue is unreferenced but predates drizzle/,
      /newsletter_preferences is live but no deployed sql references it/,
    ],
  ],
  [
    "deployed sql starts reading an unreferenced table",
    {
      sources: {
        ...real.sources,
        "workers/newsletter/src/preferences.ts":
          'db.prepare("SELECT * FROM newsletter_preferences WHERE subscriber_id = ?");',
      },
    },
    /newsletter_preferences is unreferenced but deployed sql references it at workers\/newsletter\/src\/preferences\.ts:1/,
  ],
  [
    "readme marks a quarantined table baseline",
    { readme: setRow(real.readme, "github_events", "baseline") },
    /github_events is baseline but 0004_drop_dead_tables\.sql quarantines it/,
  ],
  [
    "readme marks a baseline table quarantined without a source",
    { readme: setRow(real.readme, "atoms", "quarantined") },
    /atoms is quarantined but no migration comment or quarantine doc marks it/,
  ],
  [
    "quarantine doc stops calling ops_snapshots quarantined",
    {
      docs: Object.fromEntries(
        Object.entries(real.docs).map(([path, text]) => [
          path,
          text.replaceAll("quarantined", "kept"),
        ]),
      ),
    },
    /ops_snapshots is quarantined but no migration comment or quarantine doc marks it/,
  ],
  [
    "readme quarantined row cites none of its sources",
    {
      readme: real.readme.replace(
        /^(\|\s*`code_health`\s*\|[^|\n]*\|[^|\n]*\|)[^|\n]*\|/m,
        "$1 ledger A-21 |",
      ),
    },
    /code_health evidence cites none of its quarantine sources/,
  ],
  [
    "readme cites the wrong 0004 line",
    {
      readme: real.readme.replace(
        "commented drop at `0004_drop_dead_tables.sql:10`",
        "commented drop at `0004_drop_dead_tables.sql:11`",
      ),
    },
    /github_events cites 0004_drop_dead_tables\.sql:11, which does not name it/,
  ],
  [
    "readme marks a pre-drizzle table unreferenced",
    { readme: setRow(real.readme, "atoms", "unreferenced") },
    /atoms is unreferenced but predates drizzle/,
  ],
  // Comments are not deployed sql: a live row whose only query is commented
  // out loses its reference.
  [
    "the only email_queue query is block-commented out",
    retireEmailQueue((query) => `/* retired: ${query}, */ "SELECT 1"`),
    /readme: email_queue is live but no deployed sql references it/,
  ],
  [
    "the only email_queue query moves into a line comment",
    retireEmailQueue((query) => `"SELECT 1", // was ${query}`),
    /readme: email_queue is live but no deployed sql references it/,
  ],
];

for (const [label, overrides, expected] of mutations) {
  const result = findings({ ...real, ...overrides });
  for (const pattern of [expected].flat()) {
    assert.ok(
      result.some((problem) => pattern.test(problem)),
      `${label}: expected a finding matching ${pattern}, got ${JSON.stringify(result)}`,
    );
  }
}

// Tests, fixtures, code/SQL comments, SQL values and prose never make a table live.
assert.deepEqual(
  findings({
    ...real,
    sources: {
      ...real.sources,
      "workers/newsletter/src/index.test.ts":
        "SELECT * FROM newsletter_preferences",
      "apps/admin/src/fixtures/rows.ts": "SELECT * FROM newsletter_preferences",
      "workers/newsletter/src/comment-only.ts":
        "// SELECT * FROM newsletter_preferences\n/* SELECT * FROM newsletter_preferences */",
      "apps/www/src/pages/prose.astro":
        '<p>"SELECT * FROM newsletter_preferences"</p>',
      "workers/newsletter/src/sql-comment.ts":
        'db.prepare("/* SELECT * FROM newsletter_preferences */ SELECT 1");',
      "workers/newsletter/src/sql-line-comment.ts":
        'db.prepare("SELECT 1 -- SELECT * FROM newsletter_preferences");',
      "workers/newsletter/src/prose.ts":
        'const message = "imported from newsletter_preferences";',
      "workers/newsletter/src/sql-value.ts": `db.prepare("SELECT '-- FROM newsletter_preferences', 'from newsletter_preferences'");`,
    },
  }),
  [],
);

// Tests and fixtures never make a table live.
const readsPreferences =
  'db.prepare("SELECT * FROM newsletter_preferences").all();';
assert.deepEqual(
  findings({
    ...real,
    sources: {
      ...real.sources,
      "workers/newsletter/src/index.test.ts": readsPreferences,
      "apps/admin/src/fixtures/rows.ts": readsPreferences,
    },
  }),
  [],
);

// Comments in deployed source never make a table live, whatever their case.
assert.deepEqual(
  findings({
    ...real,
    sources: {
      ...real.sources,
      "workers/newsletter/src/note.ts": [
        "// TODO: DELETE FROM newsletter_preferences once retired",
        `/* ${readsPreferences} */`,
        "export {};",
      ].join("\n"),
    },
  }),
  [],
);

// Source and quarantine-doc changes need this light guard even when the
// release classifier correctly leaves migration replay disabled.
function hasReadyDocsGuard(workflow) {
  return workflow.jobs.ci.steps.some(
    (step) =>
      step.run?.trim() === "node scripts/ci/d1-schema-docs.test.mjs" &&
      step.if === "github.event.pull_request.draft == false",
  );
}
const ci = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
assert.ok(
  hasReadyDocsGuard(ci),
  "ready CI must always run the schema-doc guard",
);
const guardIndex = ci.jobs.ci.steps.findIndex(
  (step) => step.run?.trim() === "node scripts/ci/d1-schema-docs.test.mjs",
);
assert.ok(
  !hasReadyDocsGuard({
    jobs: {
      ci: {
        steps: ci.jobs.ci.steps.filter((_, index) => index !== guardIndex),
      },
    },
  }),
  "removing the independent guard must fail the wiring check",
);
assert.ok(
  !hasReadyDocsGuard({
    jobs: {
      ci: {
        steps: ci.jobs.ci.steps.map((step, index) =>
          index === guardIndex
            ? {
                ...step,
                if: `${step.if} && needs.classify.outputs.migration_preflight_required == 'true'`,
              }
            : step,
        ),
      },
    },
  }),
  "ordinary source changes must not depend on the migration replay flag",
);

console.log("D1 schema docs tests passed");
