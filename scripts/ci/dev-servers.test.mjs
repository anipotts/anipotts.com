#!/usr/bin/env node

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ensureAppProcess,
  isManagedProcessCommand,
  waitForApp,
} from "../dev/dev-servers.mjs";
import { startManagedAstro } from "../dev/dev-servers-child.mjs";
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
  "operations.isRecognizedProcess(prior)",
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
  /\[join\(SCRIPT_DIR, "dev-servers-child.mjs"\), "--port", String\(port\)\]/,
  "the manager starts its own exact-port Astro child",
);
assert.ok(manager.includes('stdio: ["ignore", logFd, logFd, "ipc"]'));
assert.ok(
  manager.includes("record.listening"),
  "health must wait for confirmed child readiness",
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
assert.deepEqual(
  [...environment.matchAll(/^name = "([^"]+)"$/gm)]
    .slice(1)
    .map((match) => match[1]),
  ["start website", "start admin", "check changes", "install dependencies"],
  "Codex must expose exactly the four scoped checkout actions",
);
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

// A failing health probe is not permission to replace a still-live preview.
const app = { key: "www", healthPath: "/", portEnv: "ANIPOTTS_WWW_PORT" };
const prior = {
  key: "www",
  pid: 4242,
  port: 4580,
  url: "http://127.0.0.1:4580",
  ownership: "managed",
  localOwner: false,
  logPath: "/synthetic/www.log",
};
const before = structuredClone(prior);
const calls = [];
const operations = {
  isRecognizedProcess: () => true,
  isHealthy: async () => false,
  isPortFree: async () => {
    calls.push("port");
    return true;
  },
  prepareAppDependencies: () => calls.push("prepare"),
  startApp: () => {
    calls.push("spawn");
    return { ...prior, pid: 9999 };
  },
  waitForApp: async () => calls.push("wait"),
  stopRecord: async () => calls.push("stop"),
};
await assert.rejects(
  ensureAppProcess(
    app,
    { prior, port: 4580, siteUrl: prior.url, localOwner: false },
    operations,
  ),
  /managed process 4242.*unhealthy.*No replacement was started/,
);
assert.deepEqual(
  calls,
  [],
  "unhealthy reuse must not prepare, spawn, stop or return replacement metadata",
);
assert.deepEqual(
  prior,
  before,
  "the original ownership metadata remains unchanged",
);
assert.equal(
  await ensureAppProcess(
    app,
    { prior, port: 4580, siteUrl: prior.url, localOwner: false },
    { ...operations, isHealthy: async () => true },
  ),
  prior,
  "healthy reuse returns the original metadata identity",
);
await assert.rejects(
  ensureAppProcess(
    app,
    { prior, port: 4582, siteUrl: prior.url, localOwner: false },
    operations,
  ),
  /explicitly stop it before changing its port/,
);
await assert.rejects(
  ensureAppProcess(
    app,
    { prior: null, port: 4580, siteUrl: prior.url, localOwner: false },
    { ...operations, isPortFree: async () => false },
  ),
  /in use by another process/,
);
assert.deepEqual(
  calls,
  [],
  "occupied ports must not spawn or stop another listener",
);
const cleanup = [];
await assert.rejects(
  ensureAppProcess(
    app,
    { prior: null, port: 4580, siteUrl: prior.url, localOwner: false },
    {
      ...operations,
      waitForApp: async () => {
        throw new Error("port readiness rejected");
      },
      stopRecord: async (record) => cleanup.push(record.pid),
    },
  ),
  /port readiness rejected/,
);
assert.deepEqual(
  cleanup,
  [9999],
  "startup failure stops only the just-created candidate",
);

assert.equal(
  isManagedProcessCommand(
    "pnpm exec astro dev --host 127.0.0.1 --port 4580 --ignore-lock",
    4580,
  ),
  true,
);
assert.equal(
  isManagedProcessCommand("pnpm exec astro dev --port 45801", 4580),
  false,
);
assert.equal(
  isManagedProcessCommand("pnpm exec astro build --port 4580", 4580),
  false,
);
assert.equal(
  isManagedProcessCommand(
    `node ${resolve("scripts/dev/dev-servers-child.mjs")} --port 4580`,
    4580,
  ),
  true,
);

let suppliedOptions;
let wrongPortStopped = 0;
await assert.rejects(
  startManagedAstro("/synthetic/app", 4580, async () => ({
    dev: async (options) => {
      suppliedOptions = options;
      return {
        address: { address: "127.0.0.1", port: 4581 },
        stop: async () => wrongPortStopped++,
      };
    },
  })),
  /refused its actual address/,
);
assert.equal(suppliedOptions.vite.server.strictPort, true);
assert.equal(suppliedOptions.server.open, false);
assert.equal(
  wrongPortStopped,
  1,
  "a fallback-port child must close before readiness can be accepted",
);
let wrongHostStopped = 0;
await assert.rejects(
  startManagedAstro("/synthetic/app", 4580, async () => ({
    dev: async () => ({
      address: { address: "0.0.0.0", port: 4580 },
      stop: async () => wrongHostStopped++,
    }),
  })),
  /refused its actual address/,
);
assert.equal(wrongHostStopped, 1);

// Exercise the installed Vite port binding with no Astro app, browser or config.
// The selected app's dependency supplies Vite; no package is installed for this test.
const requireApp = createRequire(resolve("apps/www/package.json"));
const requireAstro = createRequire(requireApp.resolve("astro/package.json"));
const { createServer: createViteServer } = await import(
  pathToFileURL(requireAstro.resolve("vite")).href
);
const occupied = createServer();
await new Promise((done, reject) => {
  occupied.once("error", reject);
  occupied.listen(0, "127.0.0.1", done);
});
const occupiedPort = occupied.address().port;
let viteServer;
try {
  await assert.rejects(
    startManagedAstro(process.cwd(), occupiedPort, async () => ({
      dev: async (options) => {
        viteServer = await createViteServer({
          configFile: false,
          logLevel: "silent",
          server: { ...options.server, ...options.vite.server },
          appType: "custom",
        });
        await viteServer.listen();
        return {
          address: viteServer.httpServer.address(),
          stop: () => viteServer.close(),
        };
      },
    })),
    /already in use/,
  );
  assert.equal(
    occupied.listening,
    true,
    "the conflicting listener stays untouched",
  );
} finally {
  await viteServer?.close();
  await new Promise((done) => occupied.close(done));
}
console.log(
  "dev server ownership, strict-port readiness and isolated port-conflict behavior passed",
);

// An unrelated healthy HTTP endpoint cannot satisfy readiness before this
// candidate has confirmed its exact bound address over the parent IPC channel.
let healthRequests = 0;
const healthy = createHttpServer((_request, response) => {
  healthRequests++;
  response.end("ok");
});
await new Promise((done, reject) => {
  healthy.once("error", reject);
  healthy.listen(0, "127.0.0.1", done);
});
let confirmListening;
const candidate = {
  pid: process.pid,
  port: healthy.address().port,
  url: `http://127.0.0.1:${healthy.address().port}`,
  logPath: "/synthetic/child.log",
};
Object.defineProperty(candidate, "listening", {
  value: new Promise((done) => {
    confirmListening = done;
  }),
});
try {
  const pending = waitForApp(app, candidate);
  await new Promise(setImmediate);
  assert.equal(
    healthRequests,
    0,
    "no HTTP response may be accepted before child address confirmation",
  );
  confirmListening();
  await pending;
  assert.equal(healthRequests, 1);
  assert.equal(
    Object.hasOwn(JSON.parse(JSON.stringify(candidate)), "listening"),
    false,
    "IPC readiness must never be persisted as process metadata",
  );
} finally {
  await new Promise((done) => healthy.close(done));
}
console.log("managed child readiness precedes HTTP acceptance");
