import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { readFileSync } from "node:fs";
export default defineConfig(async () => {
  // These suites qualify the historical paired DO/content recovery format.
  // New D1 drafts use native D1 recovery; adding a schema file must not silently
  // enroll it in an older export/restore format that cannot represent it.
  const migrations = (
    await readD1Migrations("./migrations/content-publication")
  ).filter((migration) => /^(0001|0002|0003)_/.test(migration.name));
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
