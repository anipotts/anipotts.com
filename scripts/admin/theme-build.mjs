import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--check")) {
  console.error("Theme build accepts only --check.");
  process.exit(1);
}

const admin = new URL("../../apps/admin/", import.meta.url);
const require = createRequire(new URL("package.json", admin));
// The neutral package's CommonJS source otherwise loads Core natively, outside
// the CLI's adaptation recorder. Transform that package so the existing guard
// can inspect its authored input; never waive the guard or invent metadata.
const result = spawnSync(
  process.execPath,
  [
    require.resolve("@astryxdesign/cli"),
    "theme",
    "build",
    "src/themes/editorial.ts",
    "--out",
    "src/themes/editorial.generated.css",
    ...args,
  ],
  {
    cwd: fileURLToPath(admin),
    env: {
      ...process.env,
      JITI_TRANSFORM_MODULES: JSON.stringify(["@astryxdesign/theme-neutral"]),
    },
    stdio: "inherit",
  },
);
process.exit(result.status ?? 1);
