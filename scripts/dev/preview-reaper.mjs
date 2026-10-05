#!/usr/bin/env node

// Stops this worktree's worker previews after a stretch of idleness. Started
// detached by dev-servers.mjs; one per worktree. It samples the CPU time of
// each managed server's process group once a minute, and stops the servers
// through `dev-servers.mjs stop all` once every group has been idle for the
// configured minutes. The integration checkout is never stopped.

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_IDLE_MINUTES,
  groupCpu,
  isIntegrationCheckout,
  nextGroupsIdleMinutes,
  parseCount,
  runningPreviews,
} from "./preview-budget.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = resolve(process.argv[2] ?? resolve(SCRIPT_DIR, "../.."));
const STATE_PATH = join(WORKTREE_ROOT, ".local", "dev-servers", "reaper.json");
const LIMIT = parseCount(
  "ANIPOTTS_PREVIEW_IDLE_MINUTES",
  process.env.ANIPOTTS_PREVIEW_IDLE_MINUTES,
  DEFAULT_IDLE_MINUTES,
);
const INTERVAL_MS = 60_000;

let idleMinutes = 0;
let lastCpu = null;
let lastServers = "";
let lastAt = Date.now();

function writeState(extra = {}) {
  try {
    writeFileSync(
      STATE_PATH,
      `${JSON.stringify({ pid: process.pid, worktreeRoot: WORKTREE_ROOT, limitMinutes: LIMIT, idleMinutes: Math.round(idleMinutes), checkedAt: new Date().toISOString(), ...extra }, null, 2)}\n`,
      { mode: 0o600 },
    );
  } catch {
    // State is advisory; a read-only checkout still gets reaped.
  }
}

function tick() {
  const previews = runningPreviews(WORKTREE_ROOT);
  if (previews.length === 0 || LIMIT === 0) {
    writeState({
      stoppedAt: new Date().toISOString(),
      reason: "nothing running",
    });
    process.exit(0);
  }
  if (isIntegrationCheckout(WORKTREE_ROOT)) {
    idleMinutes = 0;
    writeState({ exempt: "integration checkout" });
    return;
  }
  const servers = previews
    .map((record) => `${record.key}:${record.pid}`)
    .sort()
    .join(",");
  if (servers !== lastServers) {
    idleMinutes = 0;
    lastCpu = null;
    lastServers = servers;
  }
  const totals = groupCpu();
  const cpu = new Map(
    previews.map((record) => [record.pid, totals.get(record.pid) ?? 0]),
  );
  const now = Date.now();
  if (lastCpu !== null) {
    idleMinutes = nextGroupsIdleMinutes(
      idleMinutes,
      cpu,
      lastCpu,
      (now - lastAt) / 60_000,
    );
  }
  lastCpu = cpu;
  lastAt = now;
  writeState();
  if (idleMinutes < LIMIT) return;

  spawnSync(
    process.execPath,
    [join(SCRIPT_DIR, "dev-servers.mjs"), "stop", "all"],
    {
      cwd: WORKTREE_ROOT,
      stdio: "ignore",
    },
  );
  writeState({
    stoppedAt: new Date().toISOString(),
    reason: `idle for ${Math.round(idleMinutes)} minutes`,
  });
  process.exit(0);
}

writeState();
setInterval(tick, INTERVAL_MS);
tick();
