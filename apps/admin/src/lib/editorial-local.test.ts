import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  build: vi.fn(),
  bindings: vi.fn(),
  runtime: vi.fn(),
  storage: {},
}));
vi.mock("esbuild", () => ({ build: mocks.build }));
vi.mock("miniflare", () => ({
  Miniflare: class {
    constructor() {
      mocks.runtime();
    }
    getBindings() {
      return mocks.bindings();
    }
  },
}));
beforeEach(() => {
  vi.resetModules();
  mocks.build
    .mockReset()
    .mockResolvedValue({ outputFiles: [{ text: "fixture" }] });
  mocks.runtime.mockReset();
  mocks.bindings.mockReset().mockResolvedValue({
    EDITORIAL: { idFromName: () => "fixture", get: () => mocks.storage },
  });
});
it("retries failed bootstrap on the next request and coalesces concurrent retries", async () => {
  mocks.build.mockRejectedValueOnce(Error("Temporary build failure"));
  const { localDraftStorage } = await import("./editorial-local");
  await expect(localDraftStorage()).rejects.toThrow("Temporary build failure");
  expect(await Promise.all([localDraftStorage(), localDraftStorage()])).toEqual(
    [mocks.storage, mocks.storage],
  );
  expect(mocks.build).toHaveBeenCalledTimes(2);
  expect(mocks.runtime).toHaveBeenCalledTimes(1);
});
it("reuses an initialized runtime after transient binding failure", async () => {
  mocks.bindings.mockRejectedValueOnce(Error("Bindings unavailable"));
  const { localDraftStorage } = await import("./editorial-local");
  await expect(localDraftStorage()).rejects.toThrow("Bindings unavailable");
  expect(await localDraftStorage()).toBe(mocks.storage);
  expect(mocks.runtime).toHaveBeenCalledTimes(1);
  expect(mocks.build).toHaveBeenCalledTimes(1);
});
