import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { editorialHandoffApi } from "./editorial-handoff-api";
const source =
  "---\ntitle: title\nsummary: subtitle\nstatus: published\npublished_at: 2026-09-08\n---\n\nbody";
const record = { kind: "writing", id: "essay" } as const;
const token = "a".repeat(64);
const payload = {
  record,
  source,
  operationId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  baseSha256: "b".repeat(64),
  media: [],
};
const request = (
  body: unknown = payload,
  origin = "https://admin.anipotts.com",
) =>
  new Request("https://admin.anipotts.com/api/editorial/handoff", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: `__Host-editorial-csrf=${token}`,
      "X-Editorial-CSRF": token,
    },
    body: JSON.stringify(body),
  });
function deps() {
  return {
    storage: {
      saveMedia: vi.fn(),
      importHandoff: vi.fn().mockResolvedValue({
        ok: true,
        draft: { revision: 2, source },
        expectedPublicationId: "original",
      }),
    },
    readBase: vi.fn().mockResolvedValue({
      source: "base",
      baseCommit: "c".repeat(40),
      baseFileHash: null,
      directPublication: { publicationId: "latest" },
    }),
  };
}
it("uses original receipt pointer and omits source from response", async () => {
  const d = deps();
  const response = await editorialHandoffApi(request(), d);
  expect(await response.json()).toEqual({
    record,
    operationId: payload.operationId,
    revision: 2,
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    expectedPublicationId: "original",
  });
  expect(d.storage.importHandoff).toHaveBeenCalledOnce();
});
it("rejects cross-origin mutations before storage", async () => {
  const d = deps();
  expect(
    (await editorialHandoffApi(request(payload, "http://localhost:4311"), d))
      .status,
  ).toBe(403);
  expect(d.readBase).not.toHaveBeenCalled();
});
it("rejects missing or unexpected media", async () => {
  for (const data of [
    {
      ...payload,
      source: source + "\n![](/images/editorial/" + "a".repeat(64) + ".png)",
    },
    { ...payload, media: [{ id: "unused", base64: "YQ==" }] },
  ]) {
    const d = deps();
    expect((await editorialHandoffApi(request(data), d)).status).toBe(400);
    expect(d.storage.saveMedia).not.toHaveBeenCalled();
    expect(d.storage.importHandoff).not.toHaveBeenCalled();
  }
});
it("reports destination conflicts without publication", async () => {
  const d = deps();
  d.storage.importHandoff.mockResolvedValue({
    ok: false,
    code: "draft_conflict",
  });
  expect((await editorialHandoffApi(request(), d)).status).toBe(409);
});
it("requires and forwards the exact originating local revision for acknowledgment", async () => {
  const { acknowledgePublicationApi } = await import("./editorial-handoff-api");
  const storage = {
    acknowledgeLocalPublication: vi.fn().mockResolvedValue({ ok: true }),
  };
  const make = (localRevision?: number) =>
    new Request("http://localhost:4311/api/editorial/ack-publication", {
      method: "POST",
      headers: {
        Origin: "http://localhost:4311",
        "Content-Type": "application/json",
        Cookie: `__Host-editorial-csrf=${token}`,
        "X-Editorial-CSRF": token,
      },
      body: JSON.stringify({
        record,
        source,
        sourceSha256: "b".repeat(64),
        publicationId: payload.operationId,
        localRevision,
      }),
    });
  for (const revision of [undefined, 0, 1.5])
    expect(
      (await acknowledgePublicationApi(make(revision), storage)).status,
    ).toBe(400);
  expect(storage.acknowledgeLocalPublication).not.toHaveBeenCalled();
  expect((await acknowledgePublicationApi(make(7), storage)).status).toBe(200);
  expect(storage.acknowledgeLocalPublication).toHaveBeenCalledWith(
    expect.objectContaining({ localRevision: 7, source }),
  );
});
