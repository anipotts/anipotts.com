import type { E2EConfig } from "e2e";
import { chatgpt } from "e2e/oauth/chatgpt";
import { web } from "@e2e-dev/web";

// One test-owned server for both engines. Avoid the runner's release-before-boot
// ephemeral port handoff while temporary D1/media fixtures are seeded.
const portText = process.env.WWW_E2E_PORT ?? "18123";
if (
  !/^\d+$/.test(portText) ||
  Number(portText) < 1024 ||
  Number(portText) > 65535
)
  throw new Error("WWW_E2E_PORT must be an integer from 1024 to 65535");
const app = {
  url: `http://127.0.0.1:${Number(portText)}`,
  command: {
    executable: "node",
    args: ["scripts/ci/public-e2e-server.mjs", "{port}"],
    startupTimeout: 120_000,
    log: ".e2e/www-server.log",
    reuseExisting: false,
  },
};

export default {
  projectId: "anipotts-www",
  tests: "apps/www/test/e2e/*.e2e.ts",
  output: ".e2e/www",
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
  workers: 2,
} satisfies E2EConfig;
