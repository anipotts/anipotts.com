import { expect, it } from "vitest";
import {
  publishedInventoryEntry,
  mergePublishedEntries,
} from "./editorial-published-inventory";
const source = `---\ntitle: Current published title\nsummary: Current summary\nstatus: published\npublished_at: 2026-09-12\n---\n# Current body\n\n<script>alert(1)</script>\n`;
it("builds fresh published entries with current metadata and safe current body", async () => {
  const entry = await publishedInventoryEntry(
    { kind: "writing", id: "new-writing" },
    source,
  );
  expect(entry.collection).toBe("writing");
  expect(entry.data).toMatchObject({
    title: "Current published title",
    status: "published",
  });
  expect(entry.body).toContain("Current body");
  expect(entry.rendered.html).toContain("Current body");
  expect(entry.rendered.html).not.toContain("<script");
  expect(entry).not.toHaveProperty("deferredRender");
  expect(entry).not.toHaveProperty("filePath");
});
it("replaces existing identities and retains new/hidden records for the private admin inventory", async () => {
  const old = await publishedInventoryEntry(
    { kind: "writing", id: "existing" },
    source.replace("Current published title", "Old"),
  );
  const fresh = await publishedInventoryEntry(
    { kind: "writing", id: "existing" },
    source.replace("status: published", "status: draft"),
  );
  const added = await publishedInventoryEntry(
    { kind: "writing", id: "new" },
    source,
  );
  const result = mergePublishedEntries([old], [fresh, added]);
  expect(result).toHaveLength(2);
  expect(result[0]?.data).toMatchObject({
    title: "Current published title",
    status: "draft",
  });
  expect(result[1]?.id).toBe("new");
});
it("rejects invalid published sources instead of silently falling back to compiled content", async () => {
  await expect(
    publishedInventoryEntry(
      { kind: "writing", id: "test" },
      source.replace("status: published", "status: wrong"),
    ),
  ).rejects.toThrow();
});
