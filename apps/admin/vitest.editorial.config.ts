import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./test/wrangler.jsonc" },
      remoteBindings: false,
    }),
  ],
  test: {
    include: ["test/editorial/**/*.test.ts"],
    // Keep workerd instances within the same shared-host budget as DOM tests.
    maxWorkers: 2,
  },
});
