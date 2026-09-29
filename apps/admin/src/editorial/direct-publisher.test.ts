import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import {
  directPublishDraft,
  type DirectPublishInput,
  type DirectPublisherDependencies,
} from "./direct-publisher";
const repo = vi.hoisted(() => ({
  getDirectReceipt: vi.fn(),
  publishDirect: vi.fn(),
}));
vi.mock("@anipotts/content/editorial/direct-publication", () => repo);
const hash = (s: string | Uint8Array) =>
  createHash("sha256").update(s).digest("hex");
const record = { kind: "writing", id: "essay" } as const;
const source =
  "---\ntitle: title\nsummary: subtitle\nstatus: published\npublished_at: 2026-09-08\n---\n\nbody";
function setup(text = source) {
  const input: DirectPublishInput = {
    record,
    operationId: "test-operation",
    expectedRevision: 1,
    expectedPublicationId: null,
    reviewedSourceSha256: hash(text),
  };
  const deps = {
    db: {},
    store: {
      captureDirectDraft: vi
        .fn()
        .mockResolvedValue({ ok: true, draft: { source: text } }),
      readMedia: vi.fn(),
    },
    media: { put: vi.fn(), get: vi.fn() },
    validateSnapshot: vi
      .fn()
      .mockResolvedValue({ valid: true, inventoryVersion: 4 }),
    now: () => new Date("2026-09-12T12:00:00.000Z"),
  };
  return {
    input,
    deps,
    run: () =>
      directPublishDraft(deps as unknown as DirectPublisherDependencies, input),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  repo.getDirectReceipt.mockResolvedValue(null);
  repo.publishDirect.mockResolvedValue({ status: "published" });
});
it("commits frozen exact source with reviewed pointer and validated global inventory version", async () => {
  const { run, deps, input } = setup();
  expect(await run()).toEqual({ status: "published" });
  expect(deps.store.captureDirectDraft).toHaveBeenCalledWith(input);
  expect(repo.publishDirect).toHaveBeenCalledWith(
    {},
    expect.objectContaining({
      source,
      revision: 1,
      expectedPublicationId: null,
      expectedInventoryVersion: 4,
      publishedAt: "2026-09-12T12:00:00.000Z",
    }),
  );
});
it("returns original receipt after later typing without reading current draft or reactivating it", async () => {
  const { run, deps, input } = setup();
  repo.getDirectReceipt.mockResolvedValue({
    record,
    publicationId: input.operationId,
    revision: 1,
    source,
    sourceSha256: hash(source),
    publishedAt: "2026-09-11T12:00:00.000Z",
    expectedPublicationId: null,
    expectedInventoryVersion: 2,
  });
  expect(await run()).toMatchObject({
    status: "replayed",
    publication: { publishedAt: "2026-09-11T12:00:00.000Z" },
  });
  expect(deps.store.captureDirectDraft).not.toHaveBeenCalled();
  expect(repo.publishDirect).not.toHaveBeenCalled();
});
it("rejects operation reuse with a different reviewed source", async () => {
  const { run } = setup();
  repo.getDirectReceipt.mockResolvedValue({
    record,
    revision: 1,
    sourceSha256: hash("other"),
    expectedPublicationId: null,
  });
  expect(await run()).toEqual({ status: "idempotency_conflict" });
  expect(repo.publishDirect).not.toHaveBeenCalled();
});
it("rejects changed review bytes before any public write", async () => {
  const { run, input, deps } = setup();
  input.reviewedSourceSha256 = hash("different");
  expect(await run()).toEqual({ status: "revision_conflict" });
  expect(deps.media.put).not.toHaveBeenCalled();
  expect(repo.publishDirect).not.toHaveBeenCalled();
});
it("rejects invalid complete snapshot", async () => {
  const { run, deps } = setup();
  deps.validateSnapshot.mockResolvedValue({
    valid: false,
    inventoryVersion: 4,
  });
  expect(await run()).toEqual({ status: "invalid_snapshot" });
  expect(repo.publishDirect).not.toHaveBeenCalled();
});
it("does not commit missing private media", async () => {
  const id = "a".repeat(64) + ".png";
  const { run, deps } = setup(source + `\n![](/images/editorial/${id})`);
  deps.store.readMedia.mockResolvedValue(null);
  expect(await run()).toEqual({ status: "publication_image_missing" });
  expect(repo.publishDirect).not.toHaveBeenCalled();
});
it("copies and verifies content-addressed image before activating publication", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const id = hash(bytes) + ".png";
  const { run, deps } = setup(source + `\n![](/images/editorial/${id})`);
  deps.store.readMedia.mockResolvedValue({
    metadata: { id, type: "image/png", size: 3 },
    bytes,
  });
  deps.media.get.mockResolvedValue({ arrayBuffer: async () => bytes.buffer });
  expect(await run()).toEqual({ status: "published" });
  expect(deps.media.put).toHaveBeenCalledWith(
    id,
    bytes,
    expect.objectContaining({ sha256: hash(bytes) }),
  );
  expect(deps.media.get.mock.invocationCallOrder[0]).toBeLessThan(
    repo.publishDirect.mock.invocationCallOrder[0]!,
  );
});
it("does not activate publication if destination bytes differ", async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const id = hash(bytes) + ".png";
  const { run, deps } = setup(source + `\n![](/images/editorial/${id})`);
  deps.store.readMedia.mockResolvedValue({
    metadata: { id, type: "image/png", size: 3 },
    bytes,
  });
  deps.media.get.mockResolvedValue({
    arrayBuffer: async () => new Uint8Array([0]).buffer,
  });
  expect(await run()).toEqual({ status: "publication_image_copy_failed" });
  expect(repo.publishDirect).not.toHaveBeenCalled();
});
it("preserves downstream publication conflicts after immutable copies", async () => {
  const { run } = setup();
  repo.publishDirect.mockResolvedValue({ status: "conflict" });
  expect(await run()).toEqual({ status: "conflict" });
});
