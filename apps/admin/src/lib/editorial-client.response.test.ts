// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { MAX_SOURCE_BYTES } from "@anipotts/content/editorial/record";
import {
  MAX_EDITORIAL_SOURCE_RESPONSE_BYTES,
  MAX_EDITORIAL_HISTORY_RESPONSE_BYTES,
  MAX_EDITORIAL_RECORD_RESPONSE_BYTES,
  MAX_HISTORY_PAGE_BYTES,
} from "./editorial-response-bounds";
let request: (typeof import("./editorial-client"))["editorialAdminJson"];
beforeEach(async () => {
  vi.resetModules();
  localStorage.clear();
  ({ editorialAdminJson: request } = await import("./editorial-client"));
});
const draft = (source: string, revision = 1) => ({
  key: "content/public/writing/synthetic.md",
  source,
  baseCommit: "a".repeat(40),
  baseFileHash: null,
  revision,
  updatedAt: 1,
  discardedAt: null,
});
it.each(["draft", "save", "rebase", "discard", "restore", "baseline"])(
  "accepts %s's worst-case escaped source within the raw 512KiB contract",
  async (action) => {
    const source = "\u0000".repeat(MAX_SOURCE_BYTES);
    const body =
      action === "baseline"
        ? { base: { source, baseCommit: "a".repeat(40), baseFileHash: null } }
        : { ok: true, draft: draft(source) };
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(body));
    const serialized = JSON.stringify(body);
    expect(serialized.length).toBeGreaterThan(2 * 1024 * 1024);
    const response = await request(
      `/api/editorial/${action}?kind=writing&id=synthetic`,
      {},
      fetcher,
    );
    expect(await response.json()).toEqual(body);
  },
);
it("accepts composed record history, base and draft under their separate server budgets", async () => {
  const source = "\u0000".repeat(MAX_SOURCE_BYTES);
  const history = [
    draft("\u0000".repeat(300 * 1024), 2),
    draft("\u0000".repeat(300 * 1024), 1),
  ];
  expect(
    new TextEncoder().encode(history.map((row) => JSON.stringify(row)).join(""))
      .byteLength,
  ).toBeLessThan(MAX_HISTORY_PAGE_BYTES);
  const body = {
    base: { source, baseCommit: "a".repeat(40), baseFileHash: null },
    draft: draft(source, 3),
    history,
    nextBeforeRevision: null,
    publication: null,
    publishing: "ready",
  };
  expect(JSON.stringify(body).length).toBeGreaterThan(
    MAX_EDITORIAL_HISTORY_RESPONSE_BYTES,
  );
  expect(JSON.stringify(body).length).toBeLessThan(
    MAX_EDITORIAL_RECORD_RESPONSE_BYTES,
  );
  const response = await request(
    "/api/editorial/record?kind=writing&id=synthetic",
    {},
    async () => Response.json(body),
  );
  expect(await response.json()).toEqual(body);
});
it.each([
  ["record", MAX_EDITORIAL_RECORD_RESPONSE_BYTES],
  ["home", MAX_EDITORIAL_RECORD_RESPONSE_BYTES],
  ["history", MAX_EDITORIAL_HISTORY_RESPONSE_BYTES],
  ["save", MAX_EDITORIAL_SOURCE_RESPONSE_BYTES],
  ["baseline", MAX_EDITORIAL_SOURCE_RESPONSE_BYTES],
] as const)("rejects %s above its endpoint byte cap", async (action, limit) => {
  const fetcher = vi.fn<typeof fetch>(async () =>
    Response.json({ padding: "x".repeat(limit) }),
  );
  await expect(
    request(`/api/editorial/${action}`, {}, fetcher),
  ).rejects.toMatchObject({ kind: "unavailable" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
  "/api/private-reader/credential",
  "/api/editorial/csrf",
  "/api/editorial/publication?kind=writing&id=synthetic",
  "/api/editorial/history-other?path=history",
])("keeps the ordinary 2MiB bound for %s", async (url) => {
  await expect(
    request(url, {}, async () =>
      Response.json({ padding: "x".repeat(2 * 1024 * 1024) }),
    ),
  ).rejects.toMatchObject({ kind: "unavailable" });
});
