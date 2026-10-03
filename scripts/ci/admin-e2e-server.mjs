import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { ensureLocalContentDatabase } from "../dev/local-content-db.mjs";

const root = resolve(import.meta.dirname, "../..");
const appDir = resolve(root, "apps/admin");
const port = Number(process.argv[2]);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("admin e2e port must be from 1024 to 65535");
if (process.env.CI || process.env.GITHUB_ACTIONS)
  throw new Error("admin owner browser tests run locally only");

ensureLocalContentDatabase({ appDir });
const child = spawn(
  resolve(appDir, "node_modules/.bin/astro"),
  ["dev", "--host", "127.0.0.1", "--port", String(port)],
  {
    cwd: appDir,
    env: {
      ...process.env,
      ADMIN_LOCAL_OWNER: "1",
      WRANGLER_SEND_METRICS: "false",
    },
    stdio: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
