import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  liveRelease,
  releaseReadiness,
  verifyPublishedContent,
} from "../../src/editorial/release";
import type { Publication } from "../../src/editorial/publication";
const head = "a".repeat(40),
  later = "b".repeat(40);
const publication: Publication = {
  id: "12345678-1234-1234-1234-123456789abc",
  record: { kind: "writing", id: "essay" },
  source: "---\ntitle: my essay\nstatus: published\n---\nhello\n",
  revision: 1,
  path: "content/public/writing/essay.md",
  baseCommit: head,
  baseFileHash: head,
  createdAt: 1,
};
const fileHash = createHash("sha1")
  .update(`blob ${Buffer.byteLength(publication.source)}\0`)
  .update(publication.source)
  .digest("hex");
const health = (release = head) =>
  Response.json({ app: "www", ok: true, release_sha: release });
it("holds a stale renderer and unreleased changes before public disclosure", async () => {
  const compare = vi.fn().mockResolvedValue([]);
  expect(
    await releaseReadiness({ compare }, head, async () => health())(head),
  ).toEqual({ ready: true, head });
  compare.mockResolvedValue(["apps/www/src/components/HomePage.astro"]);
  expect(
    await releaseReadiness({ compare }, head, async () => health())(later),
  ).toEqual({ ready: false, code: "stale_renderer" });
  compare
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce(["content/public/pages/home.md"]);
  expect(
    await releaseReadiness({ compare }, head, async () => health())(later),
  ).toEqual({ ready: false, code: "unreleased_public_changes" });
});
it("requires the deployed source bytes, ancestry, route and stable release identity", async () => {
  const git = {
    compare: vi.fn().mockResolvedValue([]),
    readBase: vi.fn().mockResolvedValue({
      head: later,
      tree: head,
      file: {
        sha: fileHash,
        mode: "100644",
        type: "blob",
        path: publication.path,
      },
    }),
  };
  const transport: typeof fetch = async (url) =>
    String(url).endsWith("/api/health") ? health(later) : new Response("page");
  expect(await verifyPublishedContent(publication, head, git, transport)).toBe(
    true,
  );
  expect(git.compare).toHaveBeenCalledWith(head, later);
  git.readBase.mockResolvedValueOnce({
    head: later,
    tree: head,
    file: { sha: head, mode: "100644", type: "blob", path: publication.path },
  });
  expect(await verifyPublishedContent(publication, head, git, transport)).toBe(
    false,
  );
  expect(
    await verifyPublishedContent(publication, head, git, async (url) =>
      String(url).endsWith("/api/health")
        ? health(later)
        : new Response(null, { status: 404 }),
    ),
  ).toBe(false);
  let reads = 0;
  expect(
    await verifyPublishedContent(publication, head, git, async (url) =>
      String(url).endsWith("/api/health")
        ? health(++reads === 1 ? later : head)
        : new Response("page"),
    ),
  ).toBe(false);
});
it("rejects missing, spoofed, malformed or oversized health receipts", async () => {
  for (const value of [
    { app: "admin", ok: true, release_sha: head },
    { app: "www", ok: true, release_sha: "dev" },
    { app: "www", ok: false, release_sha: head },
  ])
    await expect(
      liveRelease(async () => Response.json(value)),
    ).rejects.toMatchObject({ code: "invalid_response" });
  await expect(
    liveRelease(async () => new Response("x".repeat(5000))),
  ).rejects.toMatchObject({ code: "invalid_response" });
});
