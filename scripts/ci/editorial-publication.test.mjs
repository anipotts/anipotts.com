import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { verifyPublication } from "./editorial-publication.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const pem = publicKey.export({ type: "spki", format: "pem" });
const bytes = Buffer.from("---\ntitle: home\n---\n");
const path = "content/public/pages/home.md";
const payload = {
  version: 1,
  repository: "anipotts/anipotts.com",
  operationId: "12345678-1234-1234-1234-123456789abc",
  revision: 1,
  baseHead: "a".repeat(40),
  files: [{ path, sha256: createHash("sha256").update(bytes).digest("hex") }],
};
function signed(value = payload, key = privateKey) {
  const message = [{ alg: "RS256", typ: "editorial-publication" }, value]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".");
  const [header, body] = message.split(".");
  return (
    JSON.stringify(
      {
        protected: header,
        payload: body,
        signature: sign("RSA-SHA256", Buffer.from(message), key).toString(
          "base64url",
        ),
      },
      null,
      2,
    ) + "\n"
  );
}
const input = () => ({
  envelope: signed(),
  publicKey: pem,
  branch: `codex/editorial-${payload.operationId}`,
  baseHead: payload.baseHead,
  files: [{ path, bytes, mode: "100644", type: "blob" }],
});
test("verifies committed Git bytes and refuses extra files or an advanced base", () => {
  const cwd = mkdtempSync(join(tmpdir(), "editorial-manifest-test-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    git("init", "-q");
    git("config", "user.name", "Editorial test");
    git("config", "user.email", "test@example.invalid");
    mkdirSync(join(cwd, ".github"));
    mkdirSync(join(cwd, "content/public/pages"), { recursive: true });
    writeFileSync(join(cwd, ".github/editorial-publisher.pem"), pem);
    writeFileSync(join(cwd, path), "original");
    git("add", ".github/editorial-publisher.pem", path);
    git("commit", "-qm", "test base");
    const base = git("rev-parse", "HEAD");
    writeFileSync(join(cwd, path), bytes);
    writeFileSync(
      join(cwd, "content/publication.json"),
      signed({ ...payload, baseHead: base }),
    );
    git("add", path, "content/publication.json");
    git("commit", "-qm", "test publication");
    const head = git("rev-parse", "HEAD");
    const run = (baseSha = base, headSha = head) =>
      spawnSync(
        process.execPath,
        [
          fileURLToPath(
            new URL("./editorial-publication.mjs", import.meta.url),
          ),
        ],
        {
          cwd,
          encoding: "utf8",
          env: {
            ...process.env,
            PUBLISH_BASE: baseSha,
            PUBLISH_HEAD: headSha,
            PUBLISH_BRANCH: `codex/editorial-${payload.operationId}`,
          },
        },
      );
    assert.equal(run().status, 0);
    assert.equal(JSON.parse(run().stdout).ok, true);
    assert.equal(run(head).status, 1);
    writeFileSync(join(cwd, "unexpected.js"), "do not execute me");
    git("add", "unexpected.js");
    git("commit", "-qm", "unexpected branch change");
    assert.equal(run(base, git("rev-parse", "HEAD")).status, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
test("accepts only the signed frozen bytes for the authorized operation and base", () => {
  assert.deepEqual(verifyPublication(input()), {
    operationId: payload.operationId,
    revision: 1,
    files: 1,
  });
  for (const change of [
    { branch: "codex/editorial-other" },
    { baseHead: "b".repeat(40) },
    { files: [{ ...input().files[0], bytes: Buffer.from("changed") }] },
    { files: [{ ...input().files[0], mode: "120000" }] },
    { files: [...input().files, input().files[0]] },
    { envelope: signed({ ...payload, repository: "someone/else" }) },
  ])
    assert.throws(
      () => verifyPublication({ ...input(), ...change }),
      /invalid_editorial_publication/,
    );
});
test("rejects rewriting both content and manifest without the trusted signing key", () => {
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const modified = Buffer.from("unauthorized content");
  const envelope = signed(
    {
      ...payload,
      files: [
        { path, sha256: createHash("sha256").update(modified).digest("hex") },
      ],
    },
    other.privateKey,
  );
  assert.throws(
    () =>
      verifyPublication({
        ...input(),
        envelope,
        files: [{ ...input().files[0], bytes: modified }],
      }),
    /invalid_editorial_publication/,
  );
});
test("rejects code paths, oversized source and unsupported signature envelopes", () => {
  for (const path of [
    ".github/workflows/ci.yml",
    "content/public/pages/../../secret.md",
    "content/public/writing/a.mdx",
  ]) {
    assert.throws(
      () =>
        verifyPublication({
          ...input(),
          envelope: signed({
            ...payload,
            files: [{ ...payload.files[0], path }],
          }),
          files: [{ ...input().files[0], path }],
        }),
      /invalid_editorial_publication/,
    );
  }
  assert.throws(
    () => verifyPublication({ ...input(), envelope: "e30.e30.fake" }),
    /invalid_editorial_publication/,
  );
  const large = Buffer.alloc(512 * 1024 + 1);
  assert.throws(
    () =>
      verifyPublication({
        ...input(),
        envelope: signed({
          ...payload,
          files: [
            { path, sha256: createHash("sha256").update(large).digest("hex") },
          ],
        }),
        files: [{ ...input().files[0], bytes: large }],
      }),
    /invalid_editorial_publication/,
  );
});
