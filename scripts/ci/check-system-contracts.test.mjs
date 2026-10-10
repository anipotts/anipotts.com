import assert from "node:assert/strict";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkSystemContracts } from "./check-system-contracts.mjs";

const source = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../apps/admin/src/lib/generated",
);
test("checked-in System contracts agree offline", () =>
  assert.deepEqual(checkSystemContracts(), []));
for (const change of [
  "adapter",
  "pin",
  "source",
  "exports",
  "missing",
  "identity",
  "version",
]) {
  test(`reject ${change} drift without exposing contents`, () => {
    const directory = mkdtempSync(join(tmpdir(), "system-contracts-"));
    try {
      cpSync(source, directory, { recursive: true });
      const path = join(directory, "personal-context-source.json");
      if (change === "missing") rmSync(path);
      else if (change === "adapter")
        writeFileSync(
          join(directory, "personal-context-source.ts"),
          "synthetic-sensitive",
        );
      else {
        const data = JSON.parse(readFileSync(path, "utf8"));
        if (change === "pin") data.source.sha256 = "invalid";
        if (change === "source") data.source_text += "synthetic-sensitive";
        if (change === "exports")
          data.exports.SOURCE_STATUSES = ["synthetic-sensitive"];
        if (change === "identity") data.source.contract = "synthetic-sensitive";
        if (change === "version") data.source.contract_version = "999";
        writeFileSync(path, JSON.stringify(data));
      }
      const errors = checkSystemContracts(directory);
      assert.equal(errors.length, 1);
      assert.doesNotMatch(errors.join(), /synthetic-sensitive/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
