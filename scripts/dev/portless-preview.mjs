#!/usr/bin/env node

import { spawn, execFileSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = realpathSync(resolve(SCRIPT_DIR, "../.."));
const LOCAL_DIR = join(WORKTREE_ROOT, ".local", "portless-preview");
const METADATA_PATH = join(LOCAL_DIR, "processes.json");
const PROXY_PORT = 1355;
const CANONICAL_BRANCH = "main";
const REQUIRED_NODE = { major: 24, minor: 19, patch: 0 };
// Opt-in synthetic owner for this worktree's Admin dev server only.
const LOCAL_OWNER = process.argv.includes("--local-owner");
const APPS = [
  {
    key: "www",
    packageName: "@anipotts/www",
    name: "anipotts",
    cwd: join(WORKTREE_ROOT, "apps", "www"),
    healthPath: "/",
  },
  {
    key: "admin",
    packageName: "@anipotts/admin",
    name: "admin.anipotts",
    cwd: join(WORKTREE_ROOT, "apps", "admin"),
    healthPath: "/api/health",
  },
];

function git(...args) {
  return execFileSync("git", args, {
    cwd: WORKTREE_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function sharedStateDir() {
  const commonDir = git(
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  );
  const mainRoot = dirname(realpathSync(commonDir));
  return join(mainRoot, ".local", "portless-state");
}

function primaryCheckoutRoot() {
  const commonDir = git(
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  );
  return dirname(realpathSync(commonDir));
}

function isPrimaryCheckout() {
  return WORKTREE_ROOT === primaryCheckoutRoot();
}

function assertCanonicalPreviewOwnership() {
  if (!isPrimaryCheckout()) return;

  const branch = git("branch", "--show-current");
  const head = git("rev-parse", "HEAD");
  const upstream = git("rev-parse", "origin/main");
  const dirty = git("status", "--porcelain");
  if (branch !== CANONICAL_BRANCH || head !== upstream || dirty) {
    throw new Error(
      "canonical Portless names require the clean physical main checkout at origin/main; use a linked worktree for branch previews",
    );
  }
}

function portlessEnv(options = {}) {
  const env = {
    ...process.env,
    PORTLESS_STATE_DIR: sharedStateDir(),
    PORTLESS_PORT: String(PROXY_PORT),
    PORTLESS_HTTPS: "0",
    PORTLESS_LAN: "0",
    PORTLESS_SYNC_HOSTS: "0",
    PORTLESS_TLD: "localhost",
  };
  // An inherited shell value never reaches dependency builds, the shared
  // fallback or the default Admin route; only owner mode sets it.
  delete env.ADMIN_LOCAL_OWNER;
  if (LOCAL_OWNER && options.localOwner) env.ADMIN_LOCAL_OWNER = "1";
  return env;
}

function pnpm(args, options = {}) {
  const output = execFileSync("pnpm", args, {
    cwd: options.cwd ?? WORKTREE_ROOT,
    env: portlessEnv(),
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  });
  return typeof output === "string" ? output.trim() : "";
}

function assertRuntime() {
  const [major, minor, patch] = process.versions.node.split(".").map(Number);
  const supported =
    (major === REQUIRED_NODE.major &&
      (minor > REQUIRED_NODE.minor ||
        (minor === REQUIRED_NODE.minor && patch >= REQUIRED_NODE.patch))) ||
    major === 25;
  if (!supported) {
    throw new Error(
      `anipotts.com local tools require Node >=24.19.0 <26; found ${process.version}. Run: nvm install && nvm use`,
    );
  }

  const version = pnpm(["exec", "portless", "--version"]);
  if (version !== "0.15.5") {
    throw new Error(`expected Portless 0.15.5, received ${version}`);
  }
}

function ensureProxy() {
  mkdirSync(sharedStateDir(), { recursive: true, mode: 0o700 });
  pnpm([
    "exec",
    "portless",
    "proxy",
    "start",
    "--no-tls",
    "--port",
    String(PROXY_PORT),
  ]);
}

function appUrl(app) {
  return pnpm(["exec", "portless", "get", app.name], { cwd: app.cwd });
}

async function isHealthy(url, path) {
  try {
    const response = await fetch(new URL(path, url), {
      redirect: "manual",
      signal: AbortSignal.timeout(2_500),
    });
    return (
      response.status >= 200 &&
      response.status < 400 &&
      response.headers.get("x-portless") === "1"
    );
  } catch {
    return false;
  }
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function processCommand(pid) {
  if (!isAlive(pid)) return "";
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function isRecognizedProcess(app, pid) {
  const command = processCommand(pid);
  return (
    command.includes("portless") &&
    command.includes("run") &&
    command.includes(app.name)
  );
}

function readMetadata() {
  if (!existsSync(METADATA_PATH)) return null;
  try {
    const metadata = JSON.parse(readFileSync(METADATA_PATH, "utf8"));
    return metadata.worktreeRoot === WORKTREE_ROOT ? metadata : null;
  } catch {
    return null;
  }
}

function writeMetadata(apps) {
  mkdirSync(LOCAL_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(
    METADATA_PATH,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        worktreeRoot: WORKTREE_ROOT,
        branch: git("branch", "--show-current"),
        head: git("rev-parse", "HEAD"),
        proxy: {
          port: PROXY_PORT,
          tls: false,
          lan: false,
          stateDir: sharedStateDir(),
        },
        fallbackAdminUrl: "http://localhost:4311/",
        apps,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
}

function startApp(app, url) {
  mkdirSync(LOCAL_DIR, { recursive: true, mode: 0o700 });
  const logPath = join(LOCAL_DIR, `${app.key}.log`);
  const logFd = openSync(logPath, "a", 0o600);
  const child = spawn(
    "pnpm",
    [
      "exec",
      "portless",
      "run",
      "--name",
      app.name,
      "pnpm",
      "exec",
      "astro",
      "dev",
    ],
    {
      cwd: app.cwd,
      env: portlessEnv({ localOwner: app.key === "admin" }),
      detached: true,
      stdio: ["ignore", logFd, logFd],
    },
  );
  child.unref();
  closeSync(logFd);
  return {
    key: app.key,
    name: app.name,
    url,
    pid: child.pid,
    ownership: "managed",
    localOwner: LOCAL_OWNER && app.key === "admin",
    logPath,
  };
}

function prepareAppDependencies(app) {
  pnpm(["content:generate"], { stdio: "inherit" });
  pnpm(
    [
      "turbo",
      "build",
      `--filter=${app.packageName}^...`,
      "--output-logs=errors-only",
    ],
    { stdio: "inherit" },
  );
}

async function waitForApp(app, record) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isHealthy(record.url, app.healthPath)) return;
    if (record.pid && !isAlive(record.pid)) {
      throw new Error(
        `${app.key} exited before becoming healthy; inspect ${record.logPath}`,
      );
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  throw new Error(
    `${app.key} did not become healthy at ${record.url}; inspect ${record.logPath}`,
  );
}

async function ensureFallbackAdmin() {
  // Owner mode never starts or touches the shared 4311 review fallback.
  if (LOCAL_OWNER) return;
  pnpm(["admin:preview:ensure"], { stdio: "inherit" });
}

function selectedApps(surface) {
  if (surface === "all") return APPS;
  const app = APPS.find((candidate) => candidate.key === surface);
  if (!app) throw new Error("surface must be www, admin, or all");
  return [app];
}

async function ensure(surface) {
  if (LOCAL_OWNER && surface !== "admin") {
    throw new Error("local owner mode starts only the admin surface");
  }
  assertRuntime();
  assertCanonicalPreviewOwnership();
  ensureProxy();
  if (surface === "admin" || surface === "all") await ensureFallbackAdmin();

  const previous = readMetadata();
  const records = previous?.apps ? [...previous.apps] : [];
  for (const app of selectedApps(surface)) {
    const url = appUrl(app);
    const prior = previous?.apps?.find((record) => record.key === app.key);
    const wantsLocalOwner = LOCAL_OWNER && app.key === "admin";
    const healthy = await isHealthy(url, app.healthPath);
    // Never reuse a route across owner modes, in either direction.
    const reusable =
      prior?.ownership === "managed" &&
      Boolean(prior.localOwner) === wantsLocalOwner;
    if (healthy && (wantsLocalOwner || prior?.localOwner) && !reusable) {
      throw new Error(
        `${app.key} at ${url} is already running ${prior?.localOwner ? "with" : "without"} local owner; run pnpm dev:stop first`,
      );
    }
    if (
      prior?.ownership === "managed" &&
      isRecognizedProcess(app, prior.pid) &&
      healthy
    ) {
      const index = records.findIndex((record) => record.key === app.key);
      records.splice(index < 0 ? records.length : index, index < 0 ? 0 : 1, {
        ...prior,
        url,
      });
      continue;
    }

    if (healthy) {
      const existing = {
        key: app.key,
        name: app.name,
        url,
        pid: null,
        ownership: "existing",
        logPath: null,
      };
      const index = records.findIndex((record) => record.key === app.key);
      records.splice(
        index < 0 ? records.length : index,
        index < 0 ? 0 : 1,
        existing,
      );
      continue;
    }

    prepareAppDependencies(app);
    const record = startApp(app, url);
    try {
      await waitForApp(app, record);
    } catch (error) {
      await stopRecord(app, record);
      throw error;
    }
    const index = records.findIndex((candidate) => candidate.key === app.key);
    records.splice(
      index < 0 ? records.length : index,
      index < 0 ? 0 : 1,
      record,
    );
  }

  writeMetadata(records);
  printStatus(records);
}

function printStatus(records) {
  console.log(
    `worktree=${WORKTREE_ROOT} branch=${git("branch", "--show-current")} head=${git("rev-parse", "HEAD")} canonical=${isPrimaryCheckout() ? "yes" : "no"}`,
  );
  console.log(`proxy=http://localhost:${PROXY_PORT} tls=off lan=off`);
  for (const record of records) {
    const state = record.pid
      ? isRecognizedProcess(
          APPS.find((app) => app.key === record.key),
          record.pid,
        )
        ? "running"
        : "stale"
      : record.ownership;
    console.log(
      `${record.key}=${record.url} state=${state} ownership=${record.ownership}${record.pid ? ` pid=${record.pid}` : ""}${record.localOwner ? " local-owner=on" : ""}`,
    );
  }
  if (records.some((record) => record.key === "admin" && !record.localOwner)) {
    console.log("admin-fallback=http://localhost:4311/");
  }
}

async function status(surface) {
  assertRuntime();
  const metadata = readMetadata();
  if (!metadata) {
    console.log("portless preview is not managed for this worktree");
    process.exitCode = 1;
    return;
  }

  let healthy = true;
  const expectedApps =
    surface === "all"
      ? metadata.apps
          .map((record) => APPS.find((app) => app.key === record.key))
          .filter(Boolean)
      : selectedApps(surface);
  for (const app of expectedApps) {
    const record = metadata.apps.find((candidate) => candidate.key === app.key);
    if (!record || !(await isHealthy(record.url, app.healthPath)))
      healthy = false;
  }
  printStatus(metadata.apps);
  if (!healthy) process.exitCode = 1;
}

async function stopRecord(app, record) {
  if (record.ownership !== "managed" || !record.pid) return;
  if (!isRecognizedProcess(app, record.pid)) {
    throw new Error(
      `refusing to stop unrecognized ${app.key} process ${record.pid}`,
    );
  }

  process.kill(-record.pid, "SIGTERM");
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && isAlive(record.pid)) {
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  if (isAlive(record.pid)) process.kill(-record.pid, "SIGKILL");
}

async function stop(surface) {
  const metadata = readMetadata();
  if (!metadata) {
    console.log("portless preview is not managed for this worktree");
    return;
  }

  const selected = selectedApps(surface);
  for (const app of selected) {
    const record = metadata.apps.find((candidate) => candidate.key === app.key);
    if (record) await stopRecord(app, record);
  }
  const remaining = metadata.apps.filter(
    (record) => !selected.some((app) => app.key === record.key),
  );
  if (remaining.length > 0) writeMetadata(remaining);
  else rmSync(METADATA_PATH, { force: true });
  console.log(
    `stopped managed ${surface} route${surface === "all" ? "s" : ""}; shared proxy and Admin fallback remain running`,
  );
}

const action = process.argv[2] ?? "ensure";
const surface = process.argv[3] ?? "all";
try {
  if (action === "ensure") await ensure(surface);
  else if (action === "status") await status(surface);
  else if (action === "stop") await stop(surface);
  else
    throw new Error(
      "usage: portless-preview.mjs {ensure|status|stop} {www|admin|all}",
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
