import { afterEach, describe, expect, it, vi } from "vitest";
import {
  READER_HOP_TITLES,
  ReaderNoReplyError,
  fetchReader,
} from "./reader-reach";

// A-26: notices distinguish a missed deadline from browser and reader failures.
describe("which hop a reader read failed at", () => {
  afterEach(() => vi.unstubAllGlobals());
  const failing = (() =>
    Promise.reject(
      new TypeError("Failed to fetch"),
    )) as unknown as typeof fetch;

  it("passes a reply through untouched", async () => {
    const reply = new Response("{}");
    await expect(
      fetchReader(
        (async () => reply) as unknown as typeof fetch,
        "https://r/",
        {},
      ),
    ).resolves.toBe(reply);
  });

  it("names nothing on ap-mini for a request that failed at once", async () => {
    await expect(fetchReader(failing, "https://r/", {})).rejects.toMatchObject({
      name: "ReaderNoReplyError",
      hop: "unanswered",
    });
  });

  it("names the browser when it says it is offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    await expect(fetchReader(failing, "https://r/", {})).rejects.toMatchObject({
      hop: "offline",
    });
  });

  it("names the browser when it denied local network access", async () => {
    const query = vi.fn(async () => ({ state: "denied" }));
    vi.stubGlobal("navigator", { onLine: true, permissions: { query } });
    await expect(fetchReader(failing, "https://r/", {})).rejects.toMatchObject({
      hop: "blocked",
    });
    expect(query).toHaveBeenCalledWith({ name: "local-network-access" });
  });

  it("ignores a permission the browser does not know", async () => {
    const query = vi.fn(async () => {
      throw new TypeError("unknown permission");
    });
    vi.stubGlobal("navigator", { onLine: true, permissions: { query } });
    await expect(fetchReader(failing, "https://r/", {})).rejects.toMatchObject({
      hop: "unanswered",
    });
  });

  it("rethrows a cancelled request for its caller to judge", async () => {
    const controller = new AbortController();
    controller.abort();
    const aborted = new DOMException("aborted", "AbortError");
    await expect(
      fetchReader(
        (() => Promise.reject(aborted)) as unknown as typeof fetch,
        "https://r/",
        { signal: controller.signal },
      ),
    ).rejects.toBe(aborted);
  });

  it("reports a missed deadline without claiming the Mini is offline", () => {
    expect(new ReaderNoReplyError("timeout").hop).toBe("timeout");
    expect(READER_HOP_TITLES.timeout).toBe("Mini did not respond in time");
    expect(new Set(Object.values(READER_HOP_TITLES)).size).toBe(
      Object.keys(READER_HOP_TITLES).length,
    );
    for (const title of Object.values(READER_HOP_TITLES))
      expect(title).not.toContain("unreachable");
    expect(READER_HOP_TITLES.unissued).not.toContain("ap-mini");
  });
});
