#!/usr/bin/env node

// Runs one heavy local job (full validation, end-to-end suites, scoped check
// runs) at a time across every worktree of this repository on this host.
// Others wait in turn instead of stacking builds and browsers into swap.
//
//   node scripts/dev/heavy-slot.mjs '<shell command>'
//
// The lock lives in the shared git directory, so all linked worktrees see it.
// Nested heavy commands inherit the held slot. CI runs unlocked. A lock whose
// holder has exited is reclaimed. If the lock cannot be created at all (for
// example a sandbox that protects .git), the job runs without it.

import { execFileSync, spawn } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const POLL_MS = 2_000;
const NOTICE_MS = 30_000;

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export function lockPath(cwd = process.cwd()) {
  const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  return join(resolve(cwd, common), "anipotts-heavy-slot");
}

function readHolder(path) {
  try {
    return JSON.parse(readFileSync(join(path, "holder.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Returns "acquired", "busy" with the holder, or "unavailable". */
export function tryAcquire(path, holder, now = Date.now()) {
  try {
    mkdirSync(path);
  } catch (error) {
    if (error.code !== "EEXIST") return { state: "unavailable", error };
    const current = readHolder(path);
    // Serialize stale reclamation, then reread: another contender may already
    // have replaced the exited holder with a live owner.
    const reclaim = `${path}.reclaim`;
    try {
      mkdirSync(reclaim);
    } catch {
      return { state: "busy", holder: current };
    }
    let stale = false;
    try {
      const latest = readHolder(path);
      stale = latest
        ? !isAlive(latest.pid)
        : now - statSync(path).mtimeMs > 5_000;
      if (stale) rmSync(path, { recursive: true, force: true });
    } catch (error) {
      if (error.code === "ENOENT") stale = true;
      else throw error;
    } finally {
      rmSync(reclaim, { recursive: true, force: true });
    }
    if (stale) return tryAcquire(path, holder, now);
    return { state: "busy", holder: current };
  }
  try {
    writeFileSync(join(path, "holder.json"), `${JSON.stringify(holder)}\n`);
  } catch (error) {
    rmSync(path, { recursive: true, force: true });
    return { state: "unavailable", error };
  }
  return { state: "acquired" };
}

export function release(path, pid = process.pid) {
  if (readHolder(path)?.pid === pid)
    rmSync(path, { recursive: true, force: true });
}

export async function acquire(path, holder) {
  let lastNotice = 0;
  for (;;) {
    const result = tryAcquire(path, holder);
    if (result.state !== "busy") return result.state;
    if (Date.now() - lastNotice >= NOTICE_MS) {
      const other = result.holder;
      console.error(
        other
          ? `heavy-slot: waiting for ${other.command} in ${other.cwd} (pid ${other.pid}, since ${other.startedAt})`
          : "heavy-slot: waiting for another heavy job",
      );
      lastNotice = Date.now();
    }
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
}

function run(command, env) {
  return new Promise((done) => {
    const grouped = process.platform !== "win32";
    const child = spawn(command, {
      shell: true,
      stdio: "inherit",
      env,
      detached: grouped,
    });
    let cancellation;
    const forward = (signal) => {
      const send = (value) => {
        try {
          if (grouped) process.kill(-child.pid, value);
          else child.kill(value);
        } catch (error) {
          if (error.code !== "ESRCH") throw error;
        }
      };
      send(signal);
      cancellation ??= setTimeout(() => send("SIGKILL"), 1_000);
    };
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);
    child.on("error", () => done(1));
    child.on("exit", (code, signal) => {
      // Keep ownership through escalation, even if the shell exits first.
      const finish = () => {
        process.off("SIGINT", forward);
        process.off("SIGTERM", forward);
        done(signal ? 1 : (code ?? 1));
      };
      if (cancellation) setTimeout(finish, 1_100);
      else finish();
    });
  });
}

async function main() {
  const command = process.argv.slice(2).join(" ");
  if (!command) throw new Error("usage: heavy-slot.mjs '<shell command>'");
  if (process.env.CI || process.env.ANIPOTTS_HEAVY_SLOT === "held") {
    return run(command, process.env);
  }
  let path = null;
  try {
    path = lockPath();
  } catch {
    // Outside a git checkout there is nothing to coordinate with.
  }
  const state = path
    ? await acquire(path, {
        pid: process.pid,
        cwd: process.cwd(),
        command,
        startedAt: new Date().toISOString(),
      })
    : "unavailable";
  if (state === "unavailable") {
    console.error("heavy-slot: lock unavailable; running without coordination");
    return run(command, process.env);
  }
  const cleanup = () => release(path);
  process.on("exit", cleanup);
  return run(command, { ...process.env, ANIPOTTS_HEAVY_SLOT: "held" });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
