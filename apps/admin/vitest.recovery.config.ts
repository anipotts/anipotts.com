import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./test/recovery.wrangler.jsonc" },
      remoteBindings: false,
    }),
  ],
  test: { include: ["test/recovery/**/*.test.ts"], maxWorkers: 1 },
});
