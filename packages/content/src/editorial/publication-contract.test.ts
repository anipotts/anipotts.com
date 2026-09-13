import { expect, it } from "vitest";
import { MAX_SOURCE_BYTES } from "./source.js";
import {
  decodePublishedSnapshot,
  publicationSourceHash,
  type PublishedSnapshot,
} from "./publication-contract.js";

const source =
  "---\r\ntitle: 雨 e\u0301\r\nsummary: Exact source\r\nstatus: published\r\npublished_at: 2026-09-12\r\n---\r\n\r\nAuthored text.\r\n";
async function fixture(): Promise<PublishedSnapshot> {
  return {
    contentSchemaVersion: 1,
    publicationId: "fixture-operation",
    record: { kind: "writing", id: "stable-id" },
    source,
    revision: 3,
    sourceSha256: await publicationSourceHash(source),
    publishedAt: "2026-09-12T15:00:00-04:00",
  };
}
it("decodes exact CRLF/Unicode source and preserves record identity through source slug changes", async () => {
  const original = await fixture();
  expect(await decodePublishedSnapshot(original)).toEqual(original);
  const renamedSource = source.replace(
    "summary:",
    "slug: new-address\r\nsummary:",
  );
  const renamed = await decodePublishedSnapshot({
    ...original,
    source: renamedSource,
    sourceSha256: await publicationSourceHash(renamedSource),
  });
  expect(renamed.record).toEqual(original.record);
  expect(renamed.source).toBe(renamedSource);
});
it("rejects missing or unsupported schema contracts without guessing from the source", async () => {
  const original = await fixture();
  const { contentSchemaVersion: _version, ...unversioned } = original;
  await expect(decodePublishedSnapshot(unversioned)).rejects.toThrow(
    "invalid_published_snapshot",
  );
  for (const contentSchemaVersion of [0, 2, "1", null])
    await expect(
      decodePublishedSnapshot({ ...original, contentSchemaVersion }),
    ).rejects.toThrow("unsupported_content_schema");
});
it("rejects malformed metadata with bounded errors that do not include source", async () => {
  const original = await fixture();
  for (const changed of [
    { record: { kind: "writing", id: "../private" } },
    { publicationId: "x".repeat(129) },
    { revision: 0 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { publishedAt: "2026-09-12T00:00:00+99:99" },
    { publishedAt: "2026-09-12T00:00:00." + "1".repeat(100) + "Z" },
    { publishedAt: "not-a-date" },
    { sourceSha256: "X".repeat(64) },
    { futureRequiredMeaning: true },
  ])
    await expect(
      decodePublishedSnapshot({ ...original, ...changed }),
    ).rejects.toThrow(/^invalid_published_snapshot$/);
});
it("checks UTF-8 limits, valid source semantics, and byte identity before rendering", async () => {
  const original = await fixture();
  const oversized = "雨".repeat(Math.floor(MAX_SOURCE_BYTES / 3) + 1);
  await expect(
    decodePublishedSnapshot({ ...original, source: oversized }),
  ).rejects.toThrow("invalid_published_snapshot");
  for (const invalid of [
    "missing frontmatter",
    source.replace("published", "unexpected-status"),
  ])
    await expect(
      decodePublishedSnapshot({
        ...original,
        source: invalid,
        sourceSha256: await publicationSourceHash(invalid),
      }),
    ).rejects.toThrow("invalid_publication_source");
  await expect(
    decodePublishedSnapshot({
      ...original,
      source: source.replaceAll("\r\n", "\n"),
    }),
  ).rejects.toThrow("publication_hash_mismatch");
});
it("keeps forward-compatible authored fields as exact source rather than rewriting projected YAML", async () => {
  const original = await fixture();
  const extended = source.replace(
    "summary:",
    "authored_annotation: retained exactly\r\nsummary:",
  );
  const decoded = await decodePublishedSnapshot({
    ...original,
    source: extended,
    sourceSha256: await publicationSourceHash(extended),
  });
  expect(decoded.source).toBe(extended);
});
