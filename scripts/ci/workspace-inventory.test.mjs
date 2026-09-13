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

function packageDirs(root) {
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(root, name, "package.json")))
    .sort();
}
