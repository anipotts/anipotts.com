import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";

const fixture = mkdtempSync(join(tmpdir(), "admin-task-setup-"));
try {
  mkdirSync(join(fixture, "scripts"));
  mkdirSync(join(fixture, "bin"));
  copyFileSync("scripts/codex-action", join(fixture, "scripts/codex-action"));
  for (const file of ["package.json", "pnpm-workspace.yaml", "pnpm-lock.yaml"])
    writeFileSync(join(fixture, file), "{}\n");
  const calls = join(fixture, "calls");
  for (const name of ["pnpm", "corepack", "git"]) {
    const path = join(fixture, "bin", name);
    writeFileSync(
      path,
      `#!/bin/sh\nprintf '%s\\n' '${name}' "$@" >> "$SETUP_TEST_CALLS"\n`,
    );
    chmodSync(path, 0o755);
  }
  const env = {
    ...process.env,
    CODEX_WORKTREE_PATH: fixture,
    NVM_DIR: join(fixture, "no-nvm"),
    SETUP_TEST_CALLS: calls,
    PATH: `${join(fixture, "bin")}:${dirname(process.execPath)}:/usr/bin:/bin`,
  };
  const run = (action) =>
    spawnSync("/bin/bash", [join(fixture, "scripts/codex-action"), action], {
      env,
      encoding: "utf8",
    });
  let result = run("setup");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /bootstrap deferred/);
  assert.match(
    result.stdout,
    /No dependencies installed; no application checks run/,
  );
  assert.doesNotMatch(readFileSync(calls, "utf8"), /pnpm|corepack/);
  result = run("check-all");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /codex-action bootstrap/);
  assert.doesNotMatch(readFileSync(calls, "utf8"), /pnpm|corepack/);
  result = run("bootstrap");
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(calls, "utf8"), /pnpm\ninstall\n--frozen-lockfile/);
  assert.doesNotMatch(readFileSync(calls, "utf8"), /corepack/);
  mkdirSync(join(fixture, "node_modules/.bin"), { recursive: true });
  const turbo = join(fixture, "node_modules/.bin/turbo");
  writeFileSync(turbo, "#!/bin/sh\n");
  chmodSync(turbo, 0o755);
  result = run("check-all");
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(calls, "utf8"), /pnpm\nvalidate/);
  result = run("setup");
  assert.match(result.stdout, /Existing dependencies detected/);
  rmSync(join(fixture, "pnpm-lock.yaml"));
  result = run("setup");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /manifests are required/);
  console.log(
    "Codex task setup: preflight, deferred dependencies and strict explicit actions passed",
  );
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
