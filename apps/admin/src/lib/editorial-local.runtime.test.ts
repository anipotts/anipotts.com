import { afterAll, expect, it, vi } from "vitest";
import type { Miniflare } from "miniflare";
import type { EditorialDraftStore } from "../editorial/draft-store";

const runtime = vi.hoisted(() => ({ instances: [] as Miniflare[] }));
// Keep the real esbuild bundle, workerd engine, SQL storage and RPC path. Only
// persistence is isolated, so the regression never touches private local drafts.
vi.mock("miniflare", async (importOriginal) => {
  const actual = await importOriginal<typeof import("miniflare")>();
  return {
    ...actual,
    Miniflare: class extends actual.Miniflare {
      constructor(options: ConstructorParameters<typeof actual.Miniflare>[0]) {
        super({ ...options, durableObjectsPersist: false });
        runtime.instances.push(this);
      }
    },
  };
});

afterAll(async () => {
  await Promise.all(runtime.instances.map((instance) => instance.dispose()));
});

it("boots the actual esbuild local Worker and saves, reloads and replays private drafts", async () => {
  const { localDraftStorage } = await import("./editorial-local");
  const [storage, sameStorage] = await Promise.all([
    localDraftStorage(),
    localDraftStorage(),
  ]);
  expect(runtime.instances).toHaveLength(1);
  const record = { kind: "writing", id: "local-runtime-fixture" } as const;
  const source =
    "---\ntitle: Local fixture\nsummary: Test only\nstatus: draft\n---\n\nPrivate synthetic text.\n";
  expect(await storage.get(record)).toBeNull();
  const request = {
    record,
    source,
    expectedRevision: 0,
    requestId: crypto.randomUUID(),
    baseCommit: "a".repeat(40),
    baseFileHash: null,
  };
  const saved = await storage.save(request);
  expect(saved).toMatchObject({ ok: true, draft: { source, revision: 1 } });
  expect(await sameStorage.get(record)).toMatchObject({ source, revision: 1 });
  expect(await sameStorage.save(request)).toEqual(saved);
  expect(await storage.listWritingDrafts()).toEqual([
    expect.objectContaining({ source, revision: 1 }),
  ]);
  expect(await storage.history(record)).toHaveLength(1);
  // A private local worker never silently substitutes an empty public baseline
  // or acquires publishing capability simply because the publisher is imported.
  expect(
    await (storage as EditorialDraftStore).startDirectPublication({
      record,
      expectedRevision: 1,
      operationId: crypto.randomUUID(),
      reviewedSourceSha256: "0".repeat(64),
      expectedPublicationId: null,
      expectedBaselineSha256: "0".repeat(64),
    }),
  ).toEqual({ ok: false, code: "publisher_not_configured" });
}, 30_000);
