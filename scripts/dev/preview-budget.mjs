import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { acquire, lockPath, release } from "./heavy-slot.mjs";

// Host-wide preview budget shared by every worktree of this repository. The
// integration owner's checkout (the one running `pnpm review`) is exempt;
// every other worktree shares a small number of worker preview slots, and an
// idle worker preview stops itself. See docs/local-development.md.

export const DEFAULT_WORKER_SLOTS = 1;
export const DEFAULT_IDLE_MINUTES = 30;
/** CPU seconds per minute below which a preview's process group is idle.
 * Measured on 2026-10-04: idle Astro + workerd groups used 0.05-0.45 s/min,
 * groups serving requests or rebuilding used 3.7-6.7 s/min. */
export const IDLE_CPU_SECONDS_PER_MINUTE = 1;

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
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

function command(pid) {
  try {
    return execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

export function parseCount(name, value, fallback) {
  if (value === undefined || value === "") return fallback;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`${name} must be a whole number of 0 or more`);
  }
  return count;
}

/** Paths from `git worktree list --porcelain`. */
export function parseWorktreeList(porcelain) {
  return porcelain
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
}

export function listWorktrees(cwd) {
  try {
    return parseWorktreeList(
      execFileSync("git", ["worktree", "list", "--porcelain"], {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return [];
  }
}

/** True while this checkout runs the canonical review supervisor, or while
 * `pnpm review` itself is starting it. */
export function isIntegrationCheckout(worktree, env = {}) {
  if (env.ANIPOTTS_REVIEW_LANE === "1") return true;
  const record = readJson(join(worktree, ".local/review/supervisor.json"));
  return Boolean(
    record &&
    record.checkout === worktree &&
    isAlive(record.pid) &&
    command(record.pid).includes("review-supervisor.mjs"),
  );
}

/** Managed dev servers this worktree's manager started and that still run. */
export function runningPreviews(worktree) {
  const metadata = readJson(
    join(worktree, ".local/dev-servers/processes.json"),
  );
  if (!metadata || metadata.worktreeRoot !== worktree) return [];
  return (metadata.apps ?? []).filter((record) => {
    if (record.ownership !== "managed" || !isAlive(record.pid)) return false;
    const cmd = command(record.pid);
    return cmd.includes("astro") && cmd.includes(`--port ${record.port}`);
  });
}

/** Worker previews running in other worktrees, integration checkout excluded. */
export function otherWorkerPreviews(self) {
  return listWorktrees(self)
    .filter((worktree) => worktree !== self && existsSync(worktree))
    .filter((worktree) => !isIntegrationCheckout(worktree))
    .map((worktree) => ({ worktree, apps: runningPreviews(worktree) }))
    .filter((entry) => entry.apps.length > 0);
}

export function slotError(others, slots) {
  if (others.length < slots) return null;
  const lines = others.map(
    ({ worktree, apps }) =>
      `  ${worktree}: ${apps.map((app) => `${app.key} ${app.url} pid=${app.pid}`).join(", ")}`,
  );
  return [
    `worker preview budget is full (${others.length}/${slots} in use):`,
    ...lines,
    "Review in the integration preview, hand off to its owner, or stop your own",
    "finished preview with `pnpm dev:stop` in that worktree. Idle worker previews",
    "stop on their own. For a concrete review need, rerun with",
    "ANIPOTTS_WORKER_PREVIEW_SLOTS=2 and say why in your handoff.",
  ].join("\n");
}

function cpuSeconds(time) {
  const [clock, days] = time.includes("-")
    ? [time.split("-")[1], Number(time.split("-")[0])]
    : [time, 0];
  return (
    days * 86_400 +
    clock.split(":").reduce((total, part) => total * 60 + Number(part), 0)
  );
}

/** Total CPU seconds per process group from `ps -axo pgid=,time=`. */
export function parseGroupCpu(psOutput) {
  const totals = new Map();
  for (const line of psOutput.trim().split("\n")) {
    const [pgid, time] = line.trim().split(/\s+/);
    if (!pgid || !time) continue;
    totals.set(
      Number(pgid),
      (totals.get(Number(pgid)) ?? 0) + cpuSeconds(time),
    );
  }
  return totals;
}

export function groupCpu() {
  return parseGroupCpu(
    execFileSync("ps", ["-axo", "pgid=,time="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
}

/** Consecutive idle minutes after one sample; any busy sample resets it. */
export function nextIdleMinutes(idleMinutes, cpuDelta, elapsedMinutes) {
  if (elapsedMinutes <= 0) return idleMinutes;
  if (cpuDelta < 0) return 0;
  return cpuDelta / elapsedMinutes < IDLE_CPU_SECONDS_PER_MINUTE
    ? idleMinutes + elapsedMinutes
    : 0;
}

/** Serialize the scan/start/metadata transaction across worktrees. Without this,
 * two simultaneous workers can both observe an empty budget and start. */
export async function withPreviewStartup(cwd, start) {
  const path = join(dirname(lockPath(cwd)), "anipotts-preview-start");
  const state = await acquire(path, {
    pid: process.pid,
    cwd,
    command: "preview startup",
    startedAt: new Date().toISOString(),
  });
  if (state !== "acquired")
    throw new Error(
      "Preview startup lock unavailable; coordinate with the integration owner",
    );
  try {
    return await start();
  } finally {
    release(path);
  }
}
