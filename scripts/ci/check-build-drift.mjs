#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Run after validation in a clean exact-head checkout. Ignored projections and
// build artifacts may be produced; tracked source must remain the reviewed tree.
// Checking every tracked path also catches a newly introduced generator output.
export function changedTrackedPaths(cwd = process.cwd()) {
  return execFileSync("git", ["diff", "--name-only", "-z", "HEAD", "--"], {
    cwd,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const paths = changedTrackedPaths();
  if (paths.length) {
    console.error(
      "Validation changed tracked source. Regenerate and commit it before review:",
    );
    // Paths only: never emit generated content, credentials, or private payloads.
    for (const path of paths) console.error(JSON.stringify(path));
    process.exitCode = 1;
  } else {
    console.log("Validation preserved the reviewed source tree.");
  }
}
