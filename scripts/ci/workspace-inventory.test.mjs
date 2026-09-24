#!/usr/bin/env node

import assert from "node:assert/strict";
import "./codex-action.test.mjs";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { classifiedWorkers } from "./workspace-inventory-parser.test.mjs";

const EXPECTED_APPS = ["admin", "www"];
const EXPECTED_PACKAGES = [
  "brand",
  "content",
  "control-plane-runner",
  "lib",
  "types",
];
const EXPECTED_WORKERS = ["ingest", "newsletter", "state", "weekly-email"];
const EXPECTED_WORKSPACE_GLOBS = ['"apps/*"', '"packages/*"', '"workers/*"'];
const FORBIDDEN_PATHS = [
  ["apps/labs", "apps/labs must stay archived"],
  ["services", "services workspace must stay removed"],
  [
    "archives",
    "root archives directory must stay consolidated under docs/archive",
  ],
  ["apps/admin/next.config.ts", "apps/admin must stay Astro-native"],
  ["apps/admin/next.config.mjs", "apps/admin must stay Astro-native"],
  ["apps/admin/next.config.js", "apps/admin must stay Astro-native"],
  ["apps/admin/open-next.config.ts", "apps/admin must stay Astro-native"],
  ["apps/admin/open-next.config.mjs", "apps/admin must stay Astro-native"],
  ["apps/admin/open-next.config.js", "apps/admin must stay Astro-native"],
  ["apps/admin/vercel.json", "apps/admin must stay Cloudflare Worker native"],
  ["apps/www/next.config.ts", "apps/www must stay Astro-native"],
  ["apps/www/next.config.mjs", "apps/www must stay Astro-native"],
  ["apps/www/next.config.js", "apps/www must stay Astro-native"],
  ["apps/www/open-next.config.ts", "apps/www must stay Astro-native"],
  ["apps/www/open-next.config.mjs", "apps/www must stay Astro-native"],
  ["apps/www/open-next.config.js", "apps/www must stay Astro-native"],
  ["apps/www/vercel.json", "apps/www must stay Cloudflare Worker native"],
  [
    "packages/services-platform/package.json",
    "services-platform package must stay removed from the workspace",
  ],
];

assert.deepEqual(
  packageDirs("apps"),
  EXPECTED_APPS,
  "apps inventory drifted from the target platform",
);
assert.deepEqual(
  packageDirs("packages"),
  EXPECTED_PACKAGES,
  "packages inventory drifted from the target platform",
);
assert.deepEqual(
  packageDirs("workers"),
  EXPECTED_WORKERS,
  "workers inventory drifted from retained production workers",
);
for (const [path, message] of FORBIDDEN_PATHS) {
  assert.equal(existsSync(path), false, message);
}

const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
for (const glob of EXPECTED_WORKSPACE_GLOBS) {
  assert.ok(workspace.includes(glob), `missing workspace glob ${glob}`);
}
assert.equal(
  workspace.includes('"services"'),
  false,
  "services workspace glob must stay removed",
);

const workerInventory = readFileSync("docs/worker-inventory.md", "utf8");
assert.deepEqual(
  classifiedWorkers(workerInventory),
  EXPECTED_WORKERS.map((worker) => `workers/${worker}`),
  "docs/worker-inventory.md retained workers must match workspace workers",
);

// A-36: the account inventory lists every worker the read-only pass found on
// 2026-09-23, and every row carries one of the four statuses. A worker added
// to or removed from the account needs a new read, not a silent doc edit.
const ACCOUNT_WORKERS = [
  "anipotts-admin",
  "anipotts-admin-solid",
  "anipotts-ingest",
  "anipotts-labs",
  "anipotts-newsletter-worker",
  "anipotts-state",
  "anipotts-weekly-email",
  "anipotts-www",
  "anipotts-www-astro",
  "chained-chat",
  "claude-transcripts",
  "claudemon",
  "claudemon-api",
  "claudemon-api-staging",
  "claudemon-awareness-api",
  "claudemon-awareness-mcp",
  "howoldamiactually-com",
  "labs",
  "openproof-api",
  "openproof-monitor",
  "phone-agent",
  "quantercise",
  "quantercise-api-beta",
  "saeshify",
  "yapsync",
];
const INVENTORY_STATUSES = new Set(["live", "ghost", "dangling", "orphan"]);
const outside = section(workerInventory, "## outside this repo");
assert.ok(outside, "A-36: docs/worker-inventory.md needs its outside section");
assert.deepEqual(
  firstColumnNames(section(outside, "### workers")),
  ACCOUNT_WORKERS,
  "A-36: the outside section must list every account worker",
);
for (const [heading, status] of statusCells(outside)) {
  assert.ok(
    INVENTORY_STATUSES.has(status.split(",")[0].trim()),
    `A-36: ${heading} row status "${status}" must start with live, ghost, dangling or orphan`,
  );
}
for (const host of [
  "legacy-admin.anipotts.com",
  "legacy-admin-solid.anipotts.com",
]) {
  assert.ok(
    section(outside, "### security findings")?.includes(`\`${host}\``),
    `A-36: ${host} must stay a named security finding`,
  );
}
assert.ok(
  section(outside, "### content stores (A-37)"),
  "A-37: the content store findings must stay recorded",
);

function section(source, heading) {
  const level = heading.match(/^#+/)[0];
  const start = source.indexOf(`\n${heading}\n`);
  if (start === -1) return null;
  const rest = source.slice(start + heading.length + 2);
  const end = rest.search(new RegExp(`^#{1,${level.length}}\\s`, "m"));
  return end === -1 ? rest : rest.slice(0, end);
}

function tableRows(source) {
  return source
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|\s*-/.test(line))
    .map((line) =>
      line
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    );
}

function firstColumnNames(source) {
  return tableRows(source ?? "")
    .slice(1)
    .map((cells) => cells[0].match(/^`([^`]+)`$/)?.[1] ?? cells[0])
    .sort();
}

function statusCells(source) {
  const cells = [];
  for (const table of source.split(/\n(?=###\s)/)) {
    const heading = table.match(/^###\s.*$/m)?.[0] ?? "outside";
    const [header, ...rows] = tableRows(table);
    const column = header?.indexOf("Status") ?? -1;
    if (column === -1 || heading === "outside") continue;
    for (const row of rows) cells.push([heading, row[column] ?? ""]);
  }
  return cells;
}

function packageDirs(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(root, name, "package.json")))
    .sort();
}
