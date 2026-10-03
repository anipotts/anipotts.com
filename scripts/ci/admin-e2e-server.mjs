import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ensureLocalContentDatabase } from "../dev/local-content-db.mjs";

const root = resolve(import.meta.dirname, "../..");
const appDir = resolve(root, "apps/admin");
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("admin e2e port must be from 1024 to 65535");
if (process.env.CI || process.env.GITHUB_ACTIONS)
  throw new Error("admin owner browser tests run locally only");

// This is a task-owned test process, separate from the durable review preview.
// Its D1 and Durable Object data must never reuse a developer's local drafts.
const temporary = mkdtempSync(join(tmpdir(), "admin-e2e-"));
const persistTo = join(temporary, "state");
let child;
let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  rmSync(temporary, { recursive: true, force: true });
  process.exit(code);
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (child && child.exitCode === null) child.kill(signal);
    else close();
  });

try {
  ensureLocalContentDatabase({ appDir, persistTo });
  child = spawn(
    resolve(appDir, "node_modules/.bin/astro"),
    ["dev", "--host", "127.0.0.1", "--port", String(port)],
    {
      cwd: appDir,
      env: {
        ...process.env,
        ADMIN_LOCAL_OWNER: "1",
        ADMIN_E2E_STATE_DIR: persistTo,
        WRANGLER_SEND_METRICS: "false",
      },
      stdio: "inherit",
    },
  );
  child.once("exit", (code) => close(code ?? 1));
} catch (error) {
  console.error(error);
  close(1);
}
