import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { publicationMediaFiles } from "./publication-media";
import type { Publication } from "./publication";

const bytes = Buffer.from("an immutable image fixture");
const id = `${createHash("sha256").update(bytes).digest("hex")}.jpg`;
const publication: Publication = {
  id: "12345678-1234-1234-1234-123456789abc",
  record: { kind: "writing", id: "article" },
  revision: 1,
  path: "content/public/writing/article.md",
  source: `![Photo](/images/editorial/${id})`,
  baseCommit: "a".repeat(40),
  baseFileHash: null,
  createdAt: 1,
  attachments: [{ id, base64: bytes.toString("base64") }],
};
describe("immutable publication images", () => {
  it("binds each referenced image to its exact bytes and fixed destination", () => {
    expect(publicationMediaFiles(publication)).toEqual([
      {
        path: `apps/www/public/images/editorial/${id}`,
        bytes,
        sha256: id.split(".")[0],
      },
    ]);
    expect(
      publicationMediaFiles({
        ...publication,
        source: `${publication.source}\n${publication.source}`,
      }),
    ).toHaveLength(1);
  });
  it("rejects missing, duplicate, unreferenced and substituted attachments", () => {
    for (const attachments of [
      undefined,
      [],
      [publication.attachments![0]!, publication.attachments![0]!],
      [{ id, base64: Buffer.from("substituted bytes").toString("base64") }],
      [{ id: `${"b".repeat(64)}.jpg`, base64: bytes.toString("base64") }],
    ])
      expect(() =>
        publicationMediaFiles({ ...publication, attachments }),
      ).toThrow("invalid_publication_media");
    expect(() =>
      publicationMediaFiles({ ...publication, source: "No image" }),
    ).toThrow();
  });
});
