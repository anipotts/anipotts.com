/** Actual Turbo hash proof on disposable source, never an app build or a
 * mutation of a repository helper. Root-imported recovery changes must not
 * restore an Admin bundle cached against older executable helper bytes. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(join(root, "package.json"));
const turbo = join(dirname(require.resolve("turbo/package.json")), "bin/turbo");
const actual = JSON.parse(readFileSync(join(root, "turbo.json"), "utf8"));
const temporary = mkdtempSync(join(tmpdir(), "admin-build-cache-proof-"));
const helpers = [
  "editorial-recovery.mjs",
  "editorial-recovery-capture.mjs",
  "recovery-capture-v3.mjs",
  "recovery-media-container.mjs",
  "recovery-media-encryption.mjs",
];
const write = (path, value) => {
  const target = join(temporary, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, value);
};
try {
  write(
    "package.json",
    JSON.stringify({
      name: "cache-proof",
      private: true,
      packageManager: "pnpm@10.5.2",
    }),
  );
  write("pnpm-workspace.yaml", "packages:\n  - apps/*\n");
  write(
    "pnpm-lock.yaml",
    "lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: true\n  excludeLinksFromLockfile: false\nimporters:\n  .: {}\n  apps/admin: {}\n",
  );
  write(
    "turbo.json",
    JSON.stringify({
      $schema: actual.$schema,
      globalDependencies: actual.globalDependencies,
      tasks: {
        build: actual.tasks.build,
        "@anipotts/admin#build": actual.tasks["@anipotts/admin#build"],
      },
    }),
  );
  write(
    "apps/admin/package.json",
    JSON.stringify({
      name: "@anipotts/admin",
      private: true,
      scripts: {
        build:
          "node -e \"require('node:fs').writeFileSync('BUILD_EXECUTED', 'unexpected')\"",
      },
    }),
  );
  write("apps/admin/src/entry.ts", "export const app = 1;\n");
  for (const helper of helpers)
    write(`scripts/admin/${helper}`, "export const version = 1;\n");
  write("docs/unrelated.md", "first\n");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main"], {
    cwd: temporary,
  });

  const dry = () => {
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          turbo,
          "run",
          "build",
          "--filter=@anipotts/admin",
          "--dry=json",
          "--no-daemon",
        ],
        {
          cwd: temporary,
          env: { ...process.env, TURBO_TELEMETRY_DISABLED: "1" },
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 20_000,
        },
      ),
    );
    assert.equal(
      existsSync(join(temporary, "apps/admin/BUILD_EXECUTED")),
      false,
      "hash proof must never execute a build command",
    );
    const task = result.tasks.find(
      (task) => task.taskId === "@anipotts/admin#build",
    );
    assert.ok(task, "actual Turbo resolves the Admin build task");
    return task;
  };
  const baseline = dry();
  for (const helper of helpers) {
    write(`scripts/admin/${helper}`, "export const version = 2;\n");
    const changed = dry();
    assert.notEqual(
      changed.hash,
      baseline.hash,
      `${helper} runtime correction must invalidate the actual Admin build hash`,
    );
    write(`scripts/admin/${helper}`, "export const version = 1;\n");
  }
  write("docs/unrelated.md", "other\n");
  assert.equal(
    dry().hash,
    baseline.hash,
    "an unrelated document does not invalidate this explicit build input boundary",
  );
  write("apps/admin/src/entry.ts", "export const app = 2;\n");
  assert.notEqual(
    dry().hash,
    baseline.hash,
    "positive control: actual app source changes the build hash",
  );
  console.log(
    `Admin build cache: actual Turbo dry-run hashes track all ${helpers.length} recovery helpers; app positive and unrelated-doc negative controls passed; no build executed`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
  assert.equal(
    existsSync(temporary),
    false,
    "disposable hash fixture cleaned up",
  );
}
