#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

// Strings that exist only on the build-time local owner path: the synthetic
// identity in the Worker and the shell indicator in the Worker and client.
export const LOCAL_OWNER_MARKERS = [
  "local-owner@localhost",
  "data-admin-local-owner",
];

// Vite replaces the flag with a literal. Either name surviving in any build
// would mean a runtime read that a Worker binding or var could satisfy.
export const LOCAL_OWNER_FLAG_NAMES = [
  "ADMIN_LOCAL_OWNER",
  "__LOCAL_OWNER_BUILD__",
];

function* files(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else if (entry.isFile()) yield path;
  }
}

export function scanBuild(root) {
  const markers = Object.fromEntries(
    LOCAL_OWNER_MARKERS.map((marker) => [marker, []]),
  );
  const flagReferences = [];
  let count = 0;
  for (const path of files(root)) {
    count += 1;
    const bytes = readFileSync(path);
    const name = relative(root, path).split(sep).join("/");
    for (const marker of LOCAL_OWNER_MARKERS)
      if (bytes.includes(marker)) markers[marker].push(name);
    if (LOCAL_OWNER_FLAG_NAMES.some((flag) => bytes.includes(flag)))
      flagReferences.push(name);
  }
  return { files: count, markers, flagReferences };
}

export function verifyBuild(root, expectation, { allowMissing = false } = {}) {
  if (expectation !== "absent" && expectation !== "present")
    throw new Error("expectation must be absent or present");
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return allowMissing
      ? { ok: true, skipped: true, problems: [] }
      : { ok: false, problems: [`${root} is not a build directory`] };
  }
  const scan = scanBuild(root);
  const problems = [];
  if (scan.files === 0) problems.push(`${root} contains no files`);
  for (const path of scan.flagReferences)
    problems.push(`${path} references the local owner flag at runtime`);
  for (const [marker, paths] of Object.entries(scan.markers)) {
    if (expectation === "absent")
      for (const path of paths)
        problems.push(`${path} contains local owner marker ${marker}`);
    else if (paths.length === 0)
      problems.push(`no file contains local owner marker ${marker}`);
  }
  return { ok: problems.length === 0, skipped: false, problems, scan };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  const expectIndex = args.indexOf("--expect");
  const expectation = expectIndex >= 0 ? args[expectIndex + 1] : undefined;
  const allowMissing = args.includes("--allow-missing");
  const root = args.find(
    (arg, index) =>
      !arg.startsWith("--") && (expectIndex < 0 || index !== expectIndex + 1),
  );
  if (!root || !["absent", "present"].includes(expectation)) {
    console.error(
      "usage: admin-local-owner-leak.mjs --expect {absent|present} [--allow-missing] <build-dir>",
    );
    process.exit(2);
  }
  const result = verifyBuild(root, expectation, { allowMissing });
  if (result.skipped) {
    console.log(`${root} was not built in this run; nothing to scan`);
  } else if (result.ok) {
    console.log(
      `local owner ${expectation} in ${result.scan.files} files under ${root}`,
    );
  } else {
    // Paths and marker names only: never echo bundle contents.
    for (const problem of result.problems) console.error(problem);
    process.exitCode = 1;
  }
}
