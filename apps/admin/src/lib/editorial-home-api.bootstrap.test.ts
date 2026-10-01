import { expect, it, vi } from "vitest";
import { homeEditorApi } from "./editorial-home-api";
it.each(["home", "record"])(
  "%s bootstrap never queries private history",
  async (action) => {
    const get = vi.fn(async () => null);
    const historyPage = vi.fn(() => {
      throw new Error("bootstrap must not query history");
    });
    const storage = { get, historyPage } as unknown as Parameters<
      typeof homeEditorApi
    >[1];
    const response = await homeEditorApi(
      new Request(`https://admin.anipotts.com/api/editorial/${action}`),
      storage,
      async () => ({
        source: "synthetic seed",
        baseCommit: "seed",
        baseFileHash: "seed-hash",
        publicationId: null,
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      history: [],
      nextBeforeRevision: null,
    });
    expect(historyPage).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledOnce();
  },
);
