import { expect, it } from "vitest";
import { overlayPublishedInventory } from "./editorial-published-inventory";
import type { PublishedSnapshot } from "@anipotts/content/editorial/direct-publication";
const published = (id: string, status = "published") =>
  ({
    record: { kind: "writing", id },
    source: `---\ntitle: CMS title\nsummary: CMS context\nstatus: ${status}\npublished_at: 2026-09-20\n---\nCMS body`,
    publishedAt: "2026-09-21T15:04:05.000Z",
    publicationId: `pub-${id}`,
  }) as PublishedSnapshot;
it("replaces the complete bundled record and includes newly published identities", () => {
  const result = overlayPublishedInventory(
    [
      {
        collection: "writing",
        id: "existing",
        data: { title: "old", obsolete: true },
        body: "old",
      },
    ],
    [published("existing"), published("new")],
  );
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({
    data: { title: "CMS title" },
    body: "CMS body",
    publishedAt: "2026-09-21T15:04:05.000Z",
    publicationId: "pub-existing",
  });
  expect(result[0].data).not.toHaveProperty("obsolete");
  expect(result[1].id).toBe("new");
});
it("keeps explicit hidden state rather than resurrecting a bundled visible record", () => {
  const result = overlayPublishedInventory(
    [{ collection: "writing", id: "existing", data: { status: "published" } }],
    [published("existing", "draft")],
  );
  expect(result[0].data.status).toBe("draft");
});
it("fails closed on an invalid published record", () => {
  expect(() =>
    overlayPublishedInventory([], [{ ...published("bad"), source: "invalid" }]),
  ).toThrow();
});
