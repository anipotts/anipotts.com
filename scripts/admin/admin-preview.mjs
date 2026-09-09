#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const ADMIN_ROOT = join(REPO_ROOT, "apps/admin");
const STATE_ROOT = join(REPO_ROOT, ".local/admin-preview");
const METADATA_PATH = join(STATE_ROOT, "process.json");
const LOG_PATH = join(STATE_ROOT, "server.log");
const DEFAULT_HOST = "localhost";
const BIND_HOST = "127.0.0.1";
const DEFAULT_PORT = 4311;
const HEALTH_PATH = "/api/health";
const START_TIMEOUT_MS = 20_000;

const action = process.argv[2] ?? "ensure";
const host = DEFAULT_HOST;
const port = parsePort(process.env.ADMIN_PREVIEW_PORT ?? String(DEFAULT_PORT));
const origin = `http://${host}:${port}`;

if (!["ensure", "status", "stop"].includes(action)) {
  fail(`unknown action ${action}; use ensure, status, or stop`);
}

if (action === "ensure") await ensurePreview();
if (action === "status") await reportStatus();
if (action === "stop") await stopPreview();

async function ensurePreview() {
  prepareStateRoot();
  const metadata = readMetadata();
  const health = await probeHealth();

  if (health.ok) {
    const ownership =
      metadata && processMatches(metadata) ? "managed" : "existing";
    printStatus("running", { ownership, pid: metadata?.pid ?? null });
    return;
  }

  if (metadata && processMatches(metadata)) {
    const recovered = await waitForHealth(START_TIMEOUT_MS);
    if (recovered.ok) {
      printStatus("running", { ownership: "managed", pid: metadata.pid });
      return;
    }
    fail(
      `managed preview process ${metadata.pid} is alive but ${origin} is unhealthy; inspect ${LOG_PATH}`,
    );
  }

  if (metadata) removeMetadata();
  if (await portIsOpen()) {
    fail(
      `${host}:${port} is occupied by a non-admin service; no process was stopped`,
    );
  }

  const logFd = openSync(LOG_PATH, "a", 0o600);
  chmodSync(LOG_PATH, 0o600);
  const child = spawn(
    "pnpm",
    ["exec", "astro", "dev", "--host", BIND_HOST, "--port", String(port)],
    {
      cwd: ADMIN_ROOT,
      detached: true,
      env: { ...process.env, FORCE_COLOR: "0" },
      stdio: ["ignore", logFd, logFd],
    },
  );
  closeSync(logFd);
  child.unref();

  const metadataRecord = {
    version: 1,
    pid: child.pid,
    host,
    port,
    origin,
    cwd: ADMIN_ROOT,
    command: "pnpm exec astro dev",
    started_at: new Date().toISOString(),
  };
  writeMetadata(metadataRecord);

  const started = await waitForHealth(START_TIMEOUT_MS);
  if (!started.ok) {
    fail(
      `preview did not become healthy within ${START_TIMEOUT_MS / 1000}s; inspect ${LOG_PATH}`,
    );
  }

  printStatus("started", { ownership: "managed", pid: child.pid });
}

async function reportStatus() {
  const metadata = readMetadata();
  const health = await probeHealth();
  if (!health.ok) {
    printStatus("stopped", {
      ownership: metadata && processMatches(metadata) ? "managed" : "none",
      pid: metadata?.pid ?? null,
    });
    process.exitCode = 1;
    return;
  }

  printStatus("running", {
    ownership: metadata && processMatches(metadata) ? "managed" : "existing",
    pid: metadata?.pid ?? null,
  });
}

async function stopPreview() {
  const metadata = readMetadata();
  if (!metadata) {
    console.log(`admin preview is not managed; ${origin} was not changed`);
    return;
  }

  if (!processMatches(metadata)) {
    removeMetadata();
    console.log(
      `removed stale preview metadata; pid ${metadata.pid} was not changed`,
    );
    return;
  }

  process.kill(-metadata.pid, "SIGTERM");
  const stopped = await waitForStop(5_000);
  if (!stopped) {
    fail(
      `preview process group ${metadata.pid} did not stop; no stronger signal was sent`,
    );
  }

  removeMetadata();
  printStatus("stopped", { ownership: "managed", pid: metadata.pid });
}

function prepareStateRoot() {
  mkdirSync(STATE_ROOT, { recursive: true, mode: 0o700 });
  chmodSync(STATE_ROOT, 0o700);
}

function readMetadata() {
  if (!existsSync(METADATA_PATH)) return null;
  try {
    const value = JSON.parse(readFileSync(METADATA_PATH, "utf8"));
    if (
      value?.version !== 1 ||
      !Number.isSafeInteger(value.pid) ||
      value.pid <= 1 ||
      value.origin !== origin ||
      value.cwd !== ADMIN_ROOT
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function writeMetadata(metadata) {
  prepareStateRoot();
  writeFileSync(METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(METADATA_PATH, 0o600);
}

function removeMetadata() {
  rmSync(METADATA_PATH, { force: true });
}

function processMatches(metadata) {
  if (!processIsRunning(metadata.pid)) return false;
  const result = spawnSync(
    "ps",
    ["-p", String(metadata.pid), "-o", "command="],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return false;
  const command = result.stdout.trim();
  return (
    command.includes("pnpm") &&
    command.includes("astro") &&
    command.includes("--port") &&
    command.includes(String(metadata.port))
  );
}

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function probeHealth() {
  try {
    const response = await fetch(`http://${BIND_HOST}:${port}${HEALTH_PATH}`, {
      redirect: "manual",
      signal: AbortSignal.timeout(1_500),
    });
    if (response.status !== 200) return { ok: false };
    const payload = await response.json();
    return {
      ok:
        payload?.ok === true &&
        payload?.app === "admin-astro" &&
        payload?.target === "admin.anipotts.com",
    };
  } catch {
    return { ok: false };
  }
}

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await probeHealth();
    if (health.ok) return health;
    await sleep(250);
  }
  return { ok: false };
}

async function waitForStop(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await portIsOpen())) return true;
    await sleep(100);
  }
  return false;
}

function portIsOpen() {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    const finish = () => {
      socket.destroy();
      resolve(false);
    };
    socket.once("error", finish);
    socket.once("timeout", finish);
  });
}

function printStatus(status, details) {
  console.log(
    JSON.stringify({
      status,
      url: `${origin}/`,
      ...details,
      log: LOG_PATH,
    }),
  );
}

function parsePort(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1024 || parsed > 65_535) {
    fail(`invalid ADMIN_PREVIEW_PORT ${value}`);
  }
  return parsed;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fail(message) {
  console.error(`admin preview: ${message}`);
  process.exit(1);
}
