import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const sha = /^[a-f0-9]{40}$/u;
const digest = /^[a-f0-9]{64}$/u;
const schema = /^\d{4}$/u;
const targets = ["admin", "www"];

async function checksum(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function git(cwd, name) {
  return execFileSync("git", ["rev-parse", name], {
    cwd,
    encoding: "utf8",
  }).trim();
}

async function identity(cwd, target, revision, version) {
  if (
    !targets.includes(target) ||
    !sha.test(revision ?? "") ||
    !schema.test(version ?? "") ||
    git(cwd, "HEAD") !== revision
  )
    throw new Error("invalid release artifact identity");
  return {
    target,
    revision,
    schema: version,
    tree: git(cwd, "HEAD^{tree}"),
    node: process.version,
    lockfile: await checksum(join(cwd, "pnpm-lock.yaml")),
  };
}

/** Use the Astro adapter's prebuilt Worker and assets, plus Wrangler's
 * generated pointer. Resolve it from the deploy checkout after extraction. */
function buildPaths(target) {
  const root = `apps/${target}`;
  return [`${root}/dist`, `${root}/.wrangler/deploy/config.json`];
}

async function checkBuildPath(path) {
  const name = path.split("/").at(-1);
  if (/^\.(?:env|dev\.vars)(?:\.|$)/u.test(name))
    throw new Error("unexpected environment file in release artifact");
  const stat = await lstat(path);
  if (stat.isDirectory()) {
    for (const entry of await readdir(path))
      await checkBuildPath(join(path, entry));
  } else if (!stat.isFile()) {
    throw new Error("unexpected file type in release artifact");
  }
}

export async function releaseArtifact({
  mode,
  target,
  revision,
  version,
  directory,
  expectedDigest,
  cwd = process.cwd(),
}) {
  const expected = await identity(cwd, target, revision, version);
  const bundle = resolve(directory, `${target}.tar.gz`);
  const receipt = resolve(directory, `${target}.json`);
  const paths = buildPaths(target);
  if (mode === "pack") {
    for (const path of paths) await checkBuildPath(join(cwd, path));
    const pointer = JSON.parse(await readFile(join(cwd, paths[1]), "utf8"));
    if (pointer.configPath !== "../../dist/server/wrangler.json")
      throw new Error("unexpected generated deploy pointer");
    await checkBuildPath(join(cwd, paths[0], "server/wrangler.json"));
    execFileSync("tar", ["-czf", bundle, ...paths], { cwd, stdio: "inherit" });
    const checksumValue = await checksum(bundle);
    await writeFile(
      receipt,
      JSON.stringify({ ...expected, digest: checksumValue }),
    );
    return checksumValue;
  }
  if (mode !== "verify" || !digest.test(expectedDigest ?? ""))
    throw new Error("expected trusted release artifact digest");
  const actual = JSON.parse(await readFile(receipt, "utf8"));
  assert.deepEqual(
    actual,
    { ...expected, digest: expectedDigest },
    "release artifact receipt mismatch",
  );
  if ((await checksum(bundle)) !== expectedDigest)
    throw new Error("release artifact digest mismatch");
  execFileSync("tar", ["-xzf", bundle], { cwd, stdio: "inherit" });
  return expectedDigest;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [mode, target, revision, version, directory, expectedDigest] =
    process.argv.slice(2);
  try {
    console.log(
      `digest=${await releaseArtifact({
        mode,
        target,
        revision,
        version,
        directory,
        expectedDigest,
      })}`,
    );
  } catch {
    console.error(
      "Release artifact could not be packed or verified for this checkout.",
    );
    process.exitCode = 1;
  }
}
