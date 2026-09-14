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
const publicContentHotReload = readFileSync(
  "scripts/dev/public-content-hot-reload.mjs",
  "utf8",
);

assert.equal(packageJson.devDependencies.portless, "0.15.5");
assert.equal(nodeVersion, "24.19.0");
assert.equal(packageJson.engines.node, ">=24.19.0 <26");
assert.equal(packageJson.scripts["dev:local:ensure"], "pnpm dev:all");
assert.equal(packageJson.scripts["dev:local:status"], "pnpm dev:status");
assert.equal(packageJson.scripts["dev:local:stop"], "pnpm dev:stop");
assert.equal(
  packageJson.scripts["dev:www"],
  "node scripts/dev/portless-preview.mjs ensure www",
);
assert.equal(
  packageJson.scripts["dev:admin"],
  "node scripts/dev/portless-preview.mjs ensure admin",
);
assert.equal(
  packageJson.scripts["dev:all"],
  "node scripts/dev/portless-preview.mjs ensure all",
);

for (const expected of [
  "PORTLESS_PORT: String(PROXY_PORT)",
  'PORTLESS_HTTPS: "0"',
  'PORTLESS_LAN: "0"',
  'PORTLESS_SYNC_HOSTS: "0"',
  'PORTLESS_TLD: "localhost"',
  'name: "anipotts"',
  'name: "admin.anipotts"',
  'pnpm(["content:generate"], { stdio: "inherit" });',
  "prepareAppDependencies(app);",
  "`--filter=${app.packageName}^...`",
  'if (surface === "admin" || surface === "all") await ensureFallbackAdmin()',
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
assert.ok(actions.includes("pnpm_cmd dev:www"));
assert.ok(actions.includes("pnpm_cmd dev:admin"));
assert.ok(actions.includes("nvm use --silent"));
assert.ok(!actions.includes("v22.22.3"));
assert.ok(environment.includes('name = "develop public"'));
assert.ok(environment.includes('name = "develop admin"'));
assert.ok(environment.includes('name = "check changed scope"'));
assert.ok(environment.includes('name = "inspect pull request"'));
assert.ok(environment.includes('name = "inspect live state"'));
assert.ok(adminConfig.includes('[".admin.anipotts.localhost"]'));
assert.ok(publicConfig.includes('".anipotts.localhost"'));
assert.ok(adminConfig.includes("publicContentHotReload()"));
assert.ok(
  !publicConfig.includes("publicContentHotReload()"),
  "public development must use Astro's Markdown loader without regenerating editable projections",
);
for (const invariant of [
  "server.watcher.add(CONTENT_ROOT)",
  'server.watcher.on("change", schedule)',
  '["content:generate"]',
  '["turbo", "build", "--filter=@anipotts/content..."]',
  "server.moduleGraph.invalidateAll()",
  'server.ws.send({ type: "full-reload" })',
]) {
  assert.ok(
    publicContentHotReload.includes(invariant),
    `missing canonical content hot-reload invariant: ${invariant}`,
  );
}

// Local owner is opt-in: the default Admin route and the managed 4311
// fallback never inherit it, and the served build stays on loopback.
assert.equal(
  packageJson.scripts["dev:admin:owner"],
  "node scripts/dev/portless-preview.mjs ensure admin --local-owner",
);
assert.equal(
  packageJson.scripts["build:admin:owner"],
  "node scripts/dev/admin-local-owner.mjs build",
);
assert.equal(
  packageJson.scripts["preview:admin:owner"],
  "node scripts/dev/admin-local-owner.mjs serve",
);
for (const expected of [
  'const LOCAL_OWNER = process.argv.includes("--local-owner");',
  "delete env.ADMIN_LOCAL_OWNER;",
  'if (LOCAL_OWNER && options.localOwner) env.ADMIN_LOCAL_OWNER = "1";',
  "// Owner mode never starts or touches the shared 4311 review fallback.\n  if (LOCAL_OWNER) return;",
  "local owner mode starts only the admin surface",
  "Never reuse a route across owner modes, in either direction.",
]) {
  assert.ok(
    manager.includes(expected),
    `missing local owner Portless invariant: ${expected}`,
  );
}
const localOwner = readFileSync("scripts/dev/admin-local-owner.mjs", "utf8");
for (const expected of [
  'const HOST = "127.0.0.1";',
  "const RESERVED_PORTS = new Set([1355, 4311]);",
  "delete config.routes;",
  "delete runtimeEnv.ADMIN_LOCAL_OWNER;",
  'ADMIN_LOCAL_OWNER: "1"',
  '".local", "local-owner-dist"',
]) {
  assert.ok(
    localOwner.includes(expected),
    `missing local owner build invariant: ${expected}`,
  );
}
for (const forbidden of [
  '"--remote"',
  '"deploy"',
  "admin:preview",
  '"--local-upstream"',
]) {
  assert.ok(
    !localOwner.includes(forbidden),
    `local owner build must not use ${forbidden}`,
  );
}

console.log("portless preview invariants passed");
