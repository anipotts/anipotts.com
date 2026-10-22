import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations/content-publication");
  return {
    resolve: {
      alias: [
        {
          find: "./recovery-eligibility",
          replacement: new URL(
            "./test/recovery/eligibility.ts",
            import.meta.url,
          ).pathname,
        },
      ],
    },
    define: {
      __EDITORIAL_RECOVERY_MIGRATIONS__: JSON.stringify(migrations),
      __EDITORIAL_PRE_CLIENT_HASH_SQL__: JSON.stringify(
        readFileSync(
          new URL("./test/recovery/pre-client-hash.sql", import.meta.url),
          "utf8",
        ),
      ),
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./test/recovery.wrangler.jsonc" },
        remoteBindings: false,
      }),
    ],
    test: { include: ["test/recovery/**/*.test.ts"], maxWorkers: 1 },
  };
});
