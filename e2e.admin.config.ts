import type { E2EConfig } from "e2e";
import { chatgpt } from "e2e/oauth/chatgpt";
import { web } from "@e2e-dev/web";

// The approved local owner flag is refused by Astro in GitHub Actions.
if (process.env.CI || process.env.GITHUB_ACTIONS)
  throw new Error("admin owner browser tests run locally only");

const port = Number(process.env.ADMIN_E2E_PORT ?? "8873");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("ADMIN_E2E_PORT must be a local port from 1024 to 65535");

const app = {
  url: `http://127.0.0.1:${port}`,
  command: {
    executable: "node",
    args: ["scripts/ci/admin-e2e-server.mjs", String(port)],
    env: { WRANGLER_SEND_METRICS: "false" },
    startupTimeout: 120_000,
    log: ".e2e/admin-server.log",
  },
};

export default {
  projectId: "anipotts-admin-local",
  tests: "apps/admin/test/e2e/*.e2e.ts",
  output: ".e2e/admin",
  agents: {
    default: { model: chatgpt(process.env.E2E_MODEL ?? "gpt-6-luna") },
  },
  targets: [
    {
      name: "desktop-chromium",
      engine: web({
        browser: "chromium",
        viewport: { width: 1280, height: 800 },
      }),
      app,
    },
    {
      name: "phone-webkit",
      engine: web({ browser: "webkit", viewport: { width: 390, height: 844 } }),
      app,
    },
  ],
  workers: 1,
} satisfies E2EConfig;
