import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations/content-publication");
  return {
    define: { __EDITORIAL_RECOVERY_MIGRATIONS__: JSON.stringify(migrations) },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./test/recovery.wrangler.jsonc" },
        remoteBindings: false,
      }),
    ],
    test: { include: ["test/recovery/**/*.test.ts"], maxWorkers: 1 },
  };
});
