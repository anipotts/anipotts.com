import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import {
  appendFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { releaseArtifact } from "./app-release-artifact.mjs";

test("promotes only an intact target and release from the trusted build", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "app-artifact-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cwd = join(directory, "checkout");
  await mkdir(cwd);
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  await writeFile(join(cwd, "pnpm-lock.yaml"), "fixture");
  git("add", "pnpm-lock.yaml");
  git("commit", "-qm", "test(ci): seed artifact fixture");
  const dist = join(cwd, "apps/admin/dist");
  const pointer = join(cwd, "apps/admin/.wrangler/deploy");
  await mkdir(join(dist, "server"), { recursive: true });
  await mkdir(join(dist, "client"), { recursive: true });
  await mkdir(pointer, { recursive: true });
  await writeFile(
    join(pointer, "config.json"),
    '{"configPath":"../../dist/server/wrangler.json"}',
  );
  await writeFile(join(dist, "server/wrangler.json"), '{"main":"entry.mjs"}');
  await writeFile(join(dist, "server/entry.mjs"), "worker");
  await writeFile(join(dist, "client/.assetsignore"), "marker");
  const args = {
    cwd,
    directory,
    target: "admin",
    revision: git("rev-parse", "HEAD"),
    version: "0044",
  };
  const pack = () => releaseArtifact({ ...args, mode: "pack" });
  await writeFile(join(dist, ".env.production"), "fixture");
  await assert.rejects(pack, /unexpected environment file/);
  await rm(join(dist, ".env.production"));
  await symlink("entry.mjs", join(dist, "server/extra.mjs"));
  await assert.rejects(pack, /unexpected file type/);
  await rm(join(dist, "server/extra.mjs"));
  const expectedDigest = await pack();
  const verify = (changes = {}) =>
    releaseArtifact({ ...args, mode: "verify", expectedDigest, ...changes });
  await rm(dist, { recursive: true });
  await rm(pointer, { recursive: true });
  await assert.rejects(verify({ revision: "b".repeat(40) }), /identity/);
  await assert.rejects(verify({ version: "0045" }), /receipt mismatch/);
  await assert.rejects(
    verify({ expectedDigest: "0".repeat(64) }),
    /receipt mismatch/,
  );
  await assert.rejects(verify({ target: "www" }), /ENOENT/);
  await verify();
  assert.equal(
    await readFile(join(dist, "server/entry.mjs"), "utf8"),
    "worker",
  );
  assert.equal(
    await readFile(join(dist, "client/.assetsignore"), "utf8"),
    "marker",
  );
  await appendFile(join(cwd, "pnpm-lock.yaml"), "other dependency tree");
  await assert.rejects(verify(), /receipt mismatch/);
  await writeFile(join(cwd, "pnpm-lock.yaml"), "fixture");
  await appendFile(join(directory, "admin.tar.gz"), "wrong bytes");
  await assert.rejects(verify(), /digest mismatch/);
});
