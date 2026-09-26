#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  DEV_HOST,
  PORT_PAIRS,
  PORT_RANGE_START,
  RESERVED_PORTS,
  devUrl,
  freePortPair,
  parsePortOverride,
  portPair,
} from "../dev/dev-server-ports.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const nodeVersion = readFileSync(".nvmrc", "utf8").trim();
const manager = readFileSync("scripts/dev/dev-servers.mjs", "utf8");
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
const lockfile = readFileSync("pnpm-lock.yaml", "utf8");

// Local development runs plain Astro dev servers on loopback. No local proxy,
// named hostname service or tunnel is part of the toolchain.
assert.equal(packageJson.devDependencies.portless, undefined);
assert.ok(
  !/^\s+portless@/m.test(lockfile),
  "the lockfile must not carry portless",
);
assert.ok(!existsSync("scripts/dev/portless-preview.mjs"));
assert.equal(nodeVersion, "24.19.0");
assert.equal(packageJson.engines.node, ">=24.19.0 <26");
assert.equal(packageJson.scripts["dev:local:ensure"], "pnpm dev:all");
assert.equal(packageJson.scripts["dev:local:status"], "pnpm dev:status");
assert.equal(packageJson.scripts["dev:local:stop"], "pnpm dev:stop");
for (const [script, command] of [
  ["dev:www", "node scripts/dev/dev-servers.mjs ensure www"],
  ["dev:admin", "node scripts/dev/dev-servers.mjs ensure admin"],
  ["dev:all", "node scripts/dev/dev-servers.mjs ensure all"],
  ["dev:status", "node scripts/dev/dev-servers.mjs status all"],
  ["dev:stop", "node scripts/dev/dev-servers.mjs stop all"],
  [
    "dev:admin:owner",
    "node scripts/dev/dev-servers.mjs ensure admin --local-owner",
  ],
]) {
  assert.equal(packageJson.scripts[script], command, script);
}
for (const [name, command] of Object.entries(packageJson.scripts)) {
  assert.ok(!/portless/i.test(command), `${name} must not call portless`);
}

for (const expected of [
  'pnpm(["content:generate"], { stdio: "inherit" });',
  "prepareAppDependencies(app);",
  "`--filter=${app.packageName}^...`",
  'if (surface === "admin" || surface === "all") await ensureFallbackAdmin()',
  'fallbackAdminUrl: "http://localhost:4311/"',
  "isRecognizedProcess(prior)",
  "is in use by another process; stop it or set ${app.portEnv}",
]) {
  assert.ok(
    manager.includes(expected),
    `missing dev server invariant: ${expected}`,
  );
}
assert.ok(!/portless/i.test(manager), "the manager must not mention portless");

// Every server binds loopback by name and a port this manager chose.
assert.equal(DEV_HOST, "127.0.0.1");
assert.match(
  manager,
  /\[\s*"exec",\s*"astro",\s*"dev",\s*"--host",\s*DEV_HOST,\s*"--port",\s*String\(port\),\s*"--ignore-lock",\s*\]/,
  "dev servers must bind loopback explicitly on their assigned port",
);
for (const forbidden of ['"--host", "0.0.0.0"', "--host true", '"--open"']) {
  assert.ok(!manager.includes(forbidden), `manager must not use ${forbidden}`);
}

// Ports: stable per worktree, inside the documented range, never a port
// another local tool owns, and overrides validated.
const pair = portPair("/private/tmp/example-worktree");
assert.deepEqual(portPair("/private/tmp/example-worktree"), pair);
assert.equal(pair.admin, pair.www + 1);
assert.ok(pair.www >= PORT_RANGE_START);
assert.ok(pair.admin <= PORT_RANGE_START + PORT_PAIRS * 2 - 1);
assert.notDeepEqual(portPair("/private/tmp/other-worktree"), pair);
assert.deepEqual(
  [...RESERVED_PORTS].sort((a, b) => a - b),
  [1355, 4311, 8787, 8871],
);
for (const reserved of RESERVED_PORTS) {
  assert.throws(
    () => parsePortOverride("ANIPOTTS_ADMIN_PORT", String(reserved)),
    /reserved/,
  );
}
assert.throws(
  () => parsePortOverride("ANIPOTTS_WWW_PORT", "80"),
  /1024 to 65535/,
);
assert.throws(
  () => parsePortOverride("ANIPOTTS_WWW_PORT", "abc"),
  /1024 to 65535/,
);
assert.equal(parsePortOverride("ANIPOTTS_WWW_PORT", undefined), null);
assert.equal(parsePortOverride("ANIPOTTS_WWW_PORT", "4330"), 4330);
assert.equal(devUrl(4401), "http://127.0.0.1:4401");
// A busy preferred slot moves to the next pair instead of failing.
const busy = new Set([pair.www]);
const next = await freePortPair(
  "/private/tmp/example-worktree",
  async (port) => !busy.has(port),
);
assert.notEqual(next.www, pair.www);
assert.equal(next.admin, next.www + 1);

assert.ok(actions.includes("pnpm_cmd dev:www"));
assert.ok(actions.includes("pnpm_cmd dev:admin"));
assert.ok(actions.includes("nvm use --silent"));
assert.ok(!actions.includes("v22.22.3"));
assert.ok(environment.includes('name = "develop public"'));
assert.ok(environment.includes('name = "develop admin"'));
assert.ok(environment.includes('name = "check changed scope"'));
assert.ok(environment.includes('name = "inspect pull request"'));
assert.ok(environment.includes('name = "inspect live state"'));
assert.ok(!adminConfig.includes("anipotts.localhost"));
assert.ok(!publicConfig.includes("anipotts.localhost"));
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

// Local owner is opt-in: the default Admin server and the managed 4311
// fallback never inherit it, and the served build stays on loopback.
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
  "Never reuse a server across owner modes, in either direction.",
]) {
  assert.ok(
    manager.includes(expected),
    `missing local owner invariant: ${expected}`,
  );
}
const localOwner = readFileSync("scripts/dev/admin-local-owner.mjs", "utf8");
assert.match(
  localOwner,
  /"--ip",\s*HOST,/,
  "the local owner preview must pass its loopback host to wrangler dev",
);
assert.ok(
  localOwner.includes("config.dev = { ...config.dev, ip: HOST };"),
  "the served wrangler config must pin loopback as well",
);
for (const expected of [
  'const HOST = "127.0.0.1";',
  "const RESERVED_PORTS = new Set([4311]);",
  "(value >= 4400 && value <= 4999)",
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

console.log("dev server invariants passed");
