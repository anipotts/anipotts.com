#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const nodeVersion = readFileSync(".nvmrc", "utf8").trim();
const manager = readFileSync("scripts/dev/portless-preview.mjs", "utf8");
const actions = readFileSync("scripts/codex-action", "utf8");
const environment = readFileSync(
  ".codex/environments/environment.toml",
  "utf8",
);
const adminConfig = readFileSync("apps/admin/astro.config.mjs", "utf8");
const publicConfig = readFileSync("apps/www/astro.config.mjs", "utf8");

assert.equal(packageJson.devDependencies.portless, "0.15.5");
assert.equal(nodeVersion, "24.19.0");
assert.equal(packageJson.engines.node, ">=24.19.0 <26");
assert.equal(
  packageJson.scripts["dev:local:ensure"],
  "node scripts/dev/portless-preview.mjs ensure",
);
assert.equal(
  packageJson.scripts["dev:local:status"],
  "node scripts/dev/portless-preview.mjs status",
);
assert.equal(
  packageJson.scripts["dev:local:stop"],
  "node scripts/dev/portless-preview.mjs stop",
);

for (const expected of [
  "PORTLESS_PORT: String(PROXY_PORT)",
  'PORTLESS_HTTPS: "0"',
  'PORTLESS_LAN: "0"',
  'PORTLESS_SYNC_HOSTS: "0"',
  'PORTLESS_TLD: "localhost"',
  'name: "anipotts"',
  'name: "admin.anipotts"',
  'pnpm(["admin:preview:ensure"]',
  'fallbackAdminUrl: "http://localhost:4311/"',
  '"--path-format=absolute"',
  '"--git-common-dir"',
  'const CANONICAL_BRANCH = "main"',
  'git("status", "--porcelain")',
  'git("rev-parse", "origin/main")',
  "assertCanonicalPreviewOwnership();",
  "canonical Portless names require the clean physical main checkout at origin/main",
]) {
  assert.ok(
    manager.includes(expected),
    `missing Portless invariant: ${expected}`,
  );
}

for (const forbidden of [
  '"service", "install"',
  '"hosts", "sync"',
  '"trust"',
  '"clean"',
  '"--lan"',
  '"--https"',
]) {
  assert.ok(
    !manager.includes(forbidden),
    `rootless preview must not invoke ${forbidden}`,
  );
}

assert.ok(
  !manager.includes('pnpm(["exec", "portless", "proxy", "stop"'),
  "worktree stop must not stop the shared proxy",
);
assert.ok(actions.includes("pnpm_cmd dev:local:ensure"));
assert.ok(actions.includes("pnpm_cmd dev:local:status"));
assert.ok(actions.includes("pnpm_cmd dev:local:stop"));
assert.ok(actions.includes('node_version="$(tr -d'));
assert.ok(actions.includes("require_node_runtime"));
assert.ok(!actions.includes("v22.22.3"));
assert.ok(environment.includes('name = "local dev"'));
assert.ok(environment.includes('name = "local status"'));
assert.ok(environment.includes('name = "local stop"'));
assert.ok(adminConfig.includes('[".admin.anipotts.localhost"]'));
assert.ok(publicConfig.includes('".anipotts.localhost"'));

console.log("portless preview invariants passed");
