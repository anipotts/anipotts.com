import { beforeEach, expect, it, vi } from "vitest";
import {
  directEditorialApi,
  directEditorialRuntime,
  type DirectEditorialRuntime,
} from "./editorial-direct-api";
const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  home: vi.fn(),
  base: vi.fn(),
  validate: vi.fn(),
  get: vi.fn(),
}));
vi.mock("../editorial/direct-publisher", () => ({
  directPublishDraft: mocks.publish,
}));
vi.mock("./editorial-home-api", () => ({ homeEditorApi: mocks.home }));
vi.mock("./editorial-published-base", () => ({
  readPublishedBase: mocks.base,
  validatePublishedCandidate: mocks.validate,
}));
vi.mock("@anipotts/content/editorial/direct-publication", () => ({
  getPublished: mocks.get,
}));
const token = "a".repeat(64);
it("fails closed when direct publishing is selected but a binding is missing", () => {
  const configured = {
    EDITORIAL_ENABLED: "true",
    EDITORIAL_DIRECT_PUBLISH_ENABLED: "true",
    CONTENT_DB: {},
    CONTENT_MEDIA: {},
    EDITORIAL: { getByName: vi.fn(() => ({})) },
  };
  for (const key of [
    "EDITORIAL_ENABLED",
    "CONTENT_DB",
    "CONTENT_MEDIA",
    "EDITORIAL",
  ]) {
    expect(() =>
      directEditorialRuntime({ ...configured, [key]: undefined }),
    ).toThrow("direct_publisher_not_configured");
  }
  expect(directEditorialRuntime({ EDITORIAL_ENABLED: "true" })).toBeNull();
  expect(directEditorialRuntime(configured)?.enabled).toBe(true);
});
const runtime = {
  db: {},
  media: {},
  storage: {},
  enabled: true,
} as unknown as DirectEditorialRuntime;
const body = {
  discloseSource: true,
  operationId: "operation",
  expectedRevision: 2,
  expectedPublicationId: "prior",
  reviewedSourceSha256: "b".repeat(64),
};
const request = (
  value: unknown = body,
  origin = "https://admin.anipotts.com",
) =>
  new Request(
    "https://admin.anipotts.com/api/editorial/publish?kind=writing&id=essay",
    {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: `__Host-editorial-csrf=${token}`,
        "X-Editorial-CSRF": token,
      },
      body: JSON.stringify(value),
    },
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.publish.mockResolvedValue({
    status: "published",
    publication: {
      publicationId: "operation",
      source: "private-source",
      revision: 2,
    },
  });
});
it("passes reviewed revision and prior publication through and omits source from receipt", async () => {
  const response = await directEditorialApi(request(), runtime);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    directPublication: { publicationId: "operation", revision: 2 },
    status: "published",
  });
  expect(mocks.publish.mock.calls[0]![1]).toEqual({
    ...body,
    discloseSource: undefined,
    record: { kind: "writing", id: "essay" },
  });
});
it("requires same-origin CSRF before publication", async () => {
  const response = await directEditorialApi(
    request(body, "http://localhost:4311"),
    runtime,
  );
  expect(response.status).toBe(403);
  expect(mocks.publish).not.toHaveBeenCalled();
});
it("requires explicit source disclosure and baseline", async () => {
  for (const value of [
    { ...body, discloseSource: false },
    { ...body, expectedPublicationId: undefined },
    null,
  ]) {
    expect((await directEditorialApi(request(value), runtime)).status).toBe(
      400,
    );
  }
  expect(mocks.publish).not.toHaveBeenCalled();
});
it("disabled direct mode fails closed without legacy calls", async () => {
  expect(
    (await directEditorialApi(request(), { ...runtime, enabled: false }))
      .status,
  ).toBe(503);
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.home).not.toHaveBeenCalled();
});
it("does not activate content before the public renderer is ready", async () => {
  const publicReady = vi.fn().mockResolvedValue(false);
  const response = await directEditorialApi(request(), {
    ...runtime,
    publicReady,
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "public_renderer_unavailable",
  });
  expect(publicReady).toHaveBeenCalledOnce();
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(mocks.home).not.toHaveBeenCalled();
});
it("returns409forbaselineconflict", async () => {
  mocks.publish.mockResolvedValue({ status: "conflict" });
  expect((await directEditorialApi(request(), runtime)).status).toBe(409);
});
it("preserves unavailable errors while classifying invalid complete snapshots", async () => {
  await directEditorialApi(request(), runtime);
  const validate = mocks.publish.mock.calls[0]![0].validateSnapshot;
  mocks.validate.mockRejectedValue(new Error("database_unavailable"));
  await expect(
    validate({ kind: "writing", id: "essay" }, "source"),
  ).rejects.toThrow("database_unavailable");
  mocks.validate.mockResolvedValue({ valid: false, inventoryVersion: -1 });
  expect(await validate({ kind: "writing", id: "essay" }, "source")).toEqual({
    valid: false,
    inventoryVersion: -1,
  });
  mocks.validate.mockResolvedValue({ valid: true, inventoryVersion: 7 });
  expect(await validate({ kind: "writing", id: "essay" }, "source")).toEqual({
    valid: true,
    inventoryVersion: 7,
  });
});

it("returns the publication pointer captured with the same base read", async () => {
  mocks.base.mockResolvedValue({
    source: "base-A",
    baseCommit: "a".repeat(40),
    baseFileHash: "b".repeat(40),
    directPublication: { publicationId: "A", revision: 1 },
  });
  mocks.home.mockImplementation(
    async (_request, _storage, readBase) =>
      new Response(
        JSON.stringify({
          base: await readBase({ kind: "writing", id: "essay" }),
          draft: null,
        }),
      ),
  );
  const response = await directEditorialApi(
    new Request(
      "https://admin.anipotts.com/api/editorial/record?kind=writing&id=essay",
    ),
    runtime,
  );
  expect(await response.json()).toMatchObject({
    base: { source: "base-A" },
    directPublication: { publicationId: "A" },
    publicationMode: "direct",
    publishing: "ready",
  });
  expect(mocks.base).toHaveBeenCalledTimes(1);
  expect(mocks.get).not.toHaveBeenCalled();
});

it("requires public media readiness as well as the publication database", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  try {
    const configured = directEditorialRuntime({
      EDITORIAL_ENABLED: "true",
      EDITORIAL_DIRECT_PUBLISH_ENABLED: "true",
      CONTENT_DB: {},
      CONTENT_MEDIA: {},
      EDITORIAL: { getByName: () => ({}) },
    })!;
    for (const payload of [
      { content_runtime: 1 },
      { content_runtime: 1, content_media: 0 },
      { content_runtime: 0, content_media: 1 },
    ]) {
      fetcher.mockResolvedValueOnce(Response.json(payload));
      expect(await configured.publicReady!()).toBe(false);
    }
    fetcher.mockResolvedValueOnce(
      Response.json({ content_runtime: 1, content_media: 1 }),
    );
    expect(await configured.publicReady!()).toBe(true);
    fetcher.mockRejectedValueOnce(new Error("unavailable"));
    expect(await configured.publicReady!()).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
