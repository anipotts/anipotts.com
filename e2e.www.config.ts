import type { E2EConfig } from "e2e";
import { chatgpt } from "e2e/oauth/chatgpt";
import { web } from "@e2e-dev/web";

const app = {
  url: "http://127.0.0.1:0",
  command: {
    executable: "node",
    args: ["scripts/ci/public-e2e-server.mjs", "{port}"],
    startupTimeout: 120_000,
    log: ".e2e/www-server.log",
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
