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
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureLocalContentDatabase } from "./local-content-db.mjs";
import {
  DEV_HOST,
  devUrl,
  freePortPair,
  isPortFree,
  parsePortOverride,
  managedChildArgs,
  isManagedProcessCommand,
} from "./dev-server-ports.mjs";
import {
  DEFAULT_WORKER_SLOTS,
  DEFAULT_IDLE_MINUTES,
  isIntegrationCheckout,
  withPreviewStartup,
  otherWorkerPreviews,
  parseCount,
  runningPreviews,
  slotError,
} from "./preview-budget.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = realpathSync(resolve(SCRIPT_DIR, "../.."));
const LOCAL_DIR = join(WORKTREE_ROOT, ".local", "dev-servers");
const METADATA_PATH = join(LOCAL_DIR, "processes.json");
const REAPER_PATH = join(LOCAL_DIR, "reaper.json");
const REQUIRED_NODE = { major: 24, minor: 19, patch: 0 };
// Opt-in synthetic owner for this worktree's Admin dev server only.
const LOCAL_OWNER = process.argv.includes("--local-owner");
const APPS = [
  {
    key: "www",
    packageName: "@anipotts/www",
    cwd: join(WORKTREE_ROOT, "apps", "www"),
    healthPath: "/",
    portEnv: "ANIPOTTS_WWW_PORT",
  },
  {
    key: "admin",
    packageName: "@anipotts/admin",
    cwd: join(WORKTREE_ROOT, "apps", "admin"),
    healthPath: "/api/health",
    portEnv: "ANIPOTTS_ADMIN_PORT",
  },
];

function git(...args) {
  return execFileSync("git", args, {
    cwd: WORKTREE_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function childEnv(options = {}) {
  const env = { ...process.env };
  // An inherited shell value never reaches dependency builds, the shared
  // fallback or the default Admin server; only owner mode sets it.
  delete env.ADMIN_LOCAL_OWNER;
  if (LOCAL_OWNER && options.localOwner) env.ADMIN_LOCAL_OWNER = "1";
  if (options.siteUrl) env.PUBLIC_DEV_SITE_URL = `${options.siteUrl}/`;
  return env;
}

function pnpm(args, options = {}) {
  const output = execFileSync("pnpm", args, {
    cwd: options.cwd ?? WORKTREE_ROOT,
    env: childEnv(),
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
}

async function isHealthy(url, path) {
  try {
    const response = await fetch(new URL(path, url), {
      redirect: "manual",
      signal: AbortSignal.timeout(2_500),
    });
    return response.status >= 200 && response.status < 400;
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

/** Only a process this manager started for this app and port is ever stopped. */
function isRecognizedProcess(record) {
  return isManagedProcessCommand(
    processCommand(record.pid),
    record.port,
    WORKTREE_ROOT,
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

function writeMetadata(ports, apps) {
  mkdirSync(LOCAL_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(
    METADATA_PATH,
    `${JSON.stringify(
      {
        schemaVersion: 2,
        worktreeRoot: WORKTREE_ROOT,
        branch: git("branch", "--show-current"),
        head: git("rev-parse", "HEAD"),
        host: DEV_HOST,
        ports,
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

/** Ports stay fixed per worktree once chosen; overrides always win. */
async function resolvePorts(previous) {
  const overrides = Object.fromEntries(
    APPS.map((app) => [
      app.key,
      parsePortOverride(app.portEnv, process.env[app.portEnv]),
    ]),
  );
  const saved = previous?.ports;
  const base = saved ?? (await freePortPair(WORKTREE_ROOT));
  const ports = {
    www: overrides.www ?? base.www,
    admin: overrides.admin ?? base.admin,
  };
  if (ports.www === ports.admin) {
    throw new Error("the www and admin dev ports must differ");
  }
  return ports;
}

function startApp(app, port, siteUrl) {
  mkdirSync(LOCAL_DIR, { recursive: true, mode: 0o700 });
  const logPath = join(LOCAL_DIR, `${app.key}.log`);
  const logFd = openSync(logPath, "a", 0o600);
  // The app's Astro API stays foreground and uses Vite's supported strictPort.
  // The child confirms its actual address before any HTTP health is accepted.
  const child = spawn(process.execPath, managedChildArgs(WORKTREE_ROOT, port), {
    cwd: app.cwd,
    env: childEnv({
      localOwner: app.key === "admin",
      siteUrl: app.key === "admin" ? siteUrl : undefined,
    }),
    detached: true,
    stdio: ["ignore", logFd, logFd, "ipc"],
  });
  const listening = new Promise((resolveReady, rejectReady) => {
    child.once("message", (message) => {
      if (
        message?.type === "listening" &&
        message.host === DEV_HOST &&
        message.port === port
      )
        resolveReady();
      else
        rejectReady(
          new Error(`${app.key} reported an unexpected listening address`),
        );
    });
    child.once("error", rejectReady);
    child.once("exit", () =>
      rejectReady(
        new Error(
          `${app.key} exited before confirming port ${port}; inspect ${logPath}`,
        ),
      ),
    );
  });
  child.unref();
  closeSync(logFd);
  const record = {
    key: app.key,
    url: devUrl(port),
    port,
    pid: child.pid,
    ownership: "managed",
    localOwner: LOCAL_OWNER && app.key === "admin",
    logPath,
  };
  // Runtime-only readiness is never persisted as process metadata.
  Object.defineProperty(record, "listening", { value: listening });
  return record;
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
  // astro dev binds this app's local CONTENT_DB. Migrate and seed it once so a
  // fresh worktree serves content instead of a 503. Local state only.
  ensureLocalContentDatabase({ appDir: app.cwd });
}

export async function waitForApp(app, record) {
  const deadline = Date.now() + 60_000;
  let timer;
  try {
    await Promise.race([
      record.listening,
      new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${app.key} did not confirm port ${record.port}; inspect ${record.logPath}`,
              ),
            ),
          60_000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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

function upsert(records, record) {
  const index = records.findIndex((candidate) => candidate.key === record.key);
  if (index < 0) records.push(record);
  else records.splice(index, 1, record);
}

/** A worktree with nothing running claims one of the shared worker slots. */
function assertWorkerSlot(integration) {
  if (integration || runningPreviews(WORKTREE_ROOT).length > 0) return;
  const slots = parseCount(
    "ANIPOTTS_WORKER_PREVIEW_SLOTS",
    process.env.ANIPOTTS_WORKER_PREVIEW_SLOTS,
    DEFAULT_WORKER_SLOTS,
    DEFAULT_IDLE_MINUTES,
  );
  const error = slotError(otherWorkerPreviews(WORKTREE_ROOT), slots);
  if (error) throw new Error(error);
}

/** One detached idle reaper per worker worktree; see preview-reaper.mjs. */
function ensureReaper() {
  const limitMinutes = parseCount(
    "ANIPOTTS_PREVIEW_IDLE_MINUTES",
    process.env.ANIPOTTS_PREVIEW_IDLE_MINUTES,
    DEFAULT_IDLE_MINUTES,
  );
  const record = (() => {
    try {
      return JSON.parse(readFileSync(REAPER_PATH, "utf8"));
    } catch {
      return null;
    }
  })();
  if (
    record &&
    !record.stoppedAt &&
    processCommand(record.pid).includes("preview-reaper.mjs")
  ) {
    if (record.limitMinutes === limitMinutes) return;
    process.kill(record.pid, "SIGTERM");
  }
  const child = spawn(
    process.execPath,
    [join(SCRIPT_DIR, "preview-reaper.mjs"), WORKTREE_ROOT],
    { cwd: WORKTREE_ROOT, env: childEnv(), detached: true, stdio: "ignore" },
  );
  child.unref();
}

/** A live owned process is never replaced merely because an HTTP probe fails. */
export async function ensureAppProcess(
  app,
  { prior, port, siteUrl, localOwner },
  operations = {
    isRecognizedProcess,
    isHealthy,
    isPortFree,
    prepareAppDependencies,
    startApp,
    waitForApp,
    stopRecord,
  },
) {
  const wantsLocalOwner = localOwner && app.key === "admin";
  const running =
    prior?.ownership === "managed" && operations.isRecognizedProcess(prior);
  if (running) {
    if (prior.port !== port)
      throw new Error(
        `${app.key} is already running at ${prior.url}; explicitly stop it before changing its port`,
      );
    // Never reuse a server across owner modes, in either direction.
    if (Boolean(prior.localOwner) !== wantsLocalOwner)
      throw new Error(
        `${app.key} at ${prior.url} is already running ${prior.localOwner ? "with" : "without"} local owner; run pnpm dev:stop first`,
      );
    if (await operations.isHealthy(prior.url, app.healthPath)) return prior;
    throw new Error(
      `${app.key} managed process ${prior.pid} is alive but ${prior.url} is unhealthy; inspect ${prior.logPath}. No replacement was started; retry ensure after checking the log.`,
    );
  }
  if (!(await operations.isPortFree(port)))
    throw new Error(
      `${app.key} port ${port} is in use by another process; stop it or set ${app.portEnv}`,
    );
  operations.prepareAppDependencies(app);
  const record = operations.startApp(app, port, siteUrl);
  try {
    await operations.waitForApp(app, record);
  } catch (error) {
    await operations.stopRecord(record);
    throw error;
  }
  return record;
}

async function ensure(surface) {
  if (LOCAL_OWNER && surface !== "admin") {
    throw new Error("local owner mode starts only the admin surface");
  }
  assertRuntime();
  const integration = isIntegrationCheckout(WORKTREE_ROOT, process.env);
  assertWorkerSlot(integration);
  if (surface === "admin" || surface === "all") await ensureFallbackAdmin();

  const previous = readMetadata();
  const ports = await resolvePorts(previous);
  const records = previous?.apps ? [...previous.apps] : [];
  for (const app of selectedApps(surface)) {
    const port = ports[app.key];
    const prior = records.find((record) => record.key === app.key);
    const record = await ensureAppProcess(app, {
      prior,
      port,
      siteUrl: devUrl(ports.www),
      localOwner: LOCAL_OWNER,
    });
    upsert(records, record);
  }

  writeMetadata(ports, records);
  if (!integration) ensureReaper();
  printStatus(records, ports);
}

function printStatus(records, ports) {
  console.log(
    `worktree=${WORKTREE_ROOT} branch=${git("branch", "--show-current")} head=${git("rev-parse", "HEAD")}`,
  );
  for (const app of APPS) {
    if (ports && !records.some((record) => record.key === app.key))
      console.log(`${app.key}=${devUrl(ports[app.key])} state=stopped`);
  }
  for (const record of records) {
    const state = isRecognizedProcess(record) ? "running" : "stopped";
    console.log(
      `${record.key}=${record.url} state=${state} ownership=${record.ownership}${record.pid ? ` pid=${record.pid}` : ""}${record.localOwner ? " local-owner=on" : ""}`,
    );
  }
  if (records.some((record) => record.key === "admin" && !record.localOwner)) {
    console.log("admin-fallback=http://localhost:4311/");
  }
  if (existsSync(REAPER_PATH)) {
    try {
      const reaper = JSON.parse(readFileSync(REAPER_PATH, "utf8"));
      if (!reaper.stoppedAt && reaper.limitMinutes > 0)
        console.log(
          `idle-stop=after ${reaper.limitMinutes}m idle (idle ${reaper.idleMinutes}m)`,
        );
    } catch {
      // Advisory only.
    }
  }
}

async function status(surface) {
  assertRuntime();
  const metadata = readMetadata();
  if (!metadata) {
    console.log("no dev servers are managed for this worktree");
    process.exitCode = 1;
    return;
  }

  // Exit 1 when a selected server is missing, stopped or unhealthy. `all`
  // checks the servers this worktree has started.
  let healthy = metadata.apps.length > 0;
  for (const app of selectedApps(surface)) {
    const record = metadata.apps.find((candidate) => candidate.key === app.key);
    if (surface === "all" && !record) continue;
    if (
      !record ||
      !isRecognizedProcess(record) ||
      !(await isHealthy(record.url, app.healthPath))
    )
      healthy = false;
  }
  printStatus(metadata.apps, metadata.ports);
  if (!healthy) process.exitCode = 1;
}

async function stopRecord(record) {
  if (record.ownership !== "managed" || !record.pid) return;
  if (!isRecognizedProcess(record)) return;

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
    console.log("no dev servers are managed for this worktree");
    return;
  }

  const selected = selectedApps(surface);
  for (const app of selected) {
    const record = metadata.apps.find((candidate) => candidate.key === app.key);
    if (record) await stopRecord(record);
  }
  const remaining = metadata.apps.filter(
    (record) => !selected.some((app) => app.key === record.key),
  );
  // Ports stay recorded so a restart keeps the same URLs.
  if (remaining.length > 0 || metadata.ports)
    writeMetadata(metadata.ports, remaining);
  else rmSync(METADATA_PATH, { force: true });
  console.log(
    `stopped ${surface} dev server${surface === "all" ? "s" : ""} for this worktree; the Admin fallback on 4311 stays running`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const action = process.argv[2] ?? "ensure";
  const surface = process.argv[3] ?? "all";
  try {
    if (action === "ensure")
      await withPreviewStartup(WORKTREE_ROOT, () => ensure(surface));
    else if (action === "status") await status(surface);
    else if (action === "stop") await stop(surface);
    else
      throw new Error(
        "usage: dev-servers.mjs {ensure|status|stop} {www|admin|all} [--local-owner]",
      );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
