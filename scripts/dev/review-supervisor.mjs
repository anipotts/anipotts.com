// Local review process owner. Never writes to production.
import { spawn, execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJson } from "./review-state.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const watcher = join(root, "scripts/dev/sync-published-preview.mjs");
const recordPath = join(root, ".local/review/watcher.json");
let stopping = false;
function live(record) {
  if (record?.checkout !== root || !Number.isSafeInteger(record.pid))
    return false;
  try {
    process.kill(record.pid, 0);
    return execFileSync("ps", ["-p", String(record.pid), "-o", "command="], {
      encoding: "utf8",
    }).includes(watcher);
  } catch {
    return false;
  }
}
function ensure() {
  if (stopping || live(readJson(recordPath))) return;
  const child = spawn(process.execPath, [watcher, "--watch"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  writeFileSync(
    recordPath,
    JSON.stringify({
      pid: child.pid,
      checkout: root,
      command: watcher,
      startedAt: new Date().toISOString(),
    }),
    { mode: 0o600 },
  );
  child.on("error", () => console.error("publication watcher startup failed"));
}
const timer = setInterval(ensure, 5000);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    clearInterval(timer);
    const record = readJson(recordPath);
    if (live(record)) process.kill(record.pid, "SIGTERM");
    process.exit(0);
  });
ensure();
