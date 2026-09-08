import { generateKeyPairSync } from "node:crypto";
import { expect, it } from "vitest";
import { signPublication } from "./publication-signature";
import type { Publication } from "./publication";
// Exercise the actual base-side CI verifier, not a second test-only verifier.
import { verifyPublication } from "../../../../scripts/ci/editorial-publication.mjs";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKey = String(
  keys.privateKey.export({ type: "pkcs1", format: "pem" }),
);
const publicKey = String(
  keys.publicKey.export({ type: "spki", format: "pem" }),
);
const publication: Publication = {
  id: "12345678-1234-1234-1234-123456789abc",
  record: { kind: "page", id: "home" },
  path: "content/public/pages/home.md",
  source: "---\ntitle: héllo\n---\n\nunchanged 🌤\n",
  revision: 2,
  baseCommit: "a".repeat(40),
  baseFileHash: "b".repeat(40),
  createdAt: 1,
};
it("produces a deterministic manifest accepted by the real CI verifier", async () => {
  const envelope = await signPublication(
    publication,
    publication.baseCommit,
    privateKey,
  );
  expect(
    await signPublication(publication, publication.baseCommit, privateKey),
  ).toBe(envelope);
  expect(
    verifyPublication({
      envelope,
      publicKey,
      branch: `codex/editorial-${publication.id}`,
      baseHead: publication.baseCommit,
      files: [
        {
          path: publication.path,
          bytes: Buffer.from(publication.source),
          mode: "100644",
          type: "blob",
        },
      ],
    }),
  ).toEqual({ operationId: publication.id, revision: 2, files: 1 });
  expect(envelope).not.toContain(publication.source);
  expect(envelope).not.toContain("PRIVATE KEY");
});
it("rejects arbitrary paths and redacts signing failures", async () => {
  await expect(
    signPublication(
      { ...publication, path: ".github/workflows/ci.yml" },
      publication.baseCommit,
      privateKey,
    ),
  ).rejects.toThrow("publication_signing_failed");
  await expect(
    signPublication(
      publication,
      publication.baseCommit,
      "sensitive invalid key",
    ),
  ).rejects.toThrow(/^publication_signing_failed$/);
});
