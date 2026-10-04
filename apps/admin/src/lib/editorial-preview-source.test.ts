import { afterEach, expect, it, vi } from "vitest";
import { readEditorialPreviewSource } from "./editorial-preview-source";

const hash = "a".repeat(40);
const otherHash = "b".repeat(40);
const url = (query: string) =>
  new URL(`https://admin.example.test/preview/record?${query}`);
type PreviewReaders = Parameters<typeof readEditorialPreviewSource>[1];
const readers = () => ({
  baseline: vi.fn<PreviewReaders["baseline"]>(async () => ({
    source: "published baseline",
    baseFileHash: hash,
  })),
  draft: vi.fn<PreviewReaders["draft"]>(async () => ({
    source: "private saved draft",
    revision: 7,
    discardedAt: null,
  })),
});

afterEach(() => vi.useRealTimers());

it("previews the pinned published baseline without reading or manufacturing a draft", async () => {
  const read = readers();
  expect(
    await readEditorialPreviewSource(url(`revision=0&baseline=${hash}`), read),
  ).toEqual({ status: "found", source: "published baseline" });
  expect(read.baseline).toHaveBeenCalledTimes(1);
  expect(read.draft).not.toHaveBeenCalled();
});

it.each([otherHash, null])(
  "rejects a changed or absent baseline hash %s instead of serving different content",
  async (baseFileHash) => {
    const read = readers();
    read.baseline.mockResolvedValue({
      source: "newer published baseline",
      baseFileHash,
    });
    expect(
      await readEditorialPreviewSource(
        url(`revision=0&baseline=${hash}`),
        read,
      ),
    ).toEqual({ status: "stale" });
    expect(read.draft).not.toHaveBeenCalled();
  },
);

it.each([
  "",
  "baseline=" + hash,
  "revision=",
  "revision=-1",
  "revision=01",
  "revision=1.5",
  "revision=1e2",
  "revision=word",
  "revision=0",
  "revision=0&baseline=",
  "revision=0&baseline=short",
  "revision=0&baseline=" + hash.toUpperCase(),
  "revision=0&baseline=" + "a".repeat(41),
])(
  "rejects invalid preview parameters without accessing storage: %s",
  async (query) => {
    const read = readers();
    expect(await readEditorialPreviewSource(url(query), read)).toEqual({
      status: "stale",
    });
    expect(read.baseline).not.toHaveBeenCalled();
    expect(read.draft).not.toHaveBeenCalled();
  },
);

it("reads exactly the acknowledged draft revision without falling back to baseline", async () => {
  const read = readers();
  expect(await readEditorialPreviewSource(url("revision=7"), read)).toEqual({
    status: "found",
    source: "private saved draft",
  });
  expect(read.draft).toHaveBeenCalledTimes(1);
  expect(read.baseline).not.toHaveBeenCalled();
});

it.each([
  null,
  {
    source: "discarded text",
    revision: 7,
    discardedAt: 1790805600000,
  },
  { source: "older text", revision: 6, discardedAt: null },
  { source: "newer text", revision: 8, discardedAt: null },
])("treats missing, discarded or mismatched drafts as stale", async (draft) => {
  const read = readers();
  const draftRead = vi.fn(async () => draft);
  expect(
    await readEditorialPreviewSource(url("revision=7"), {
      ...read,
      draft: draftRead,
    }),
  ).toEqual({ status: "stale" });
  expect(read.baseline).not.toHaveBeenCalled();
});

it.each(["baseline", "draft"] as const)(
  "returns unavailable for a %s read failure without exposing its diagnostic",
  async (kind) => {
    const read = readers();
    read[kind].mockRejectedValue(new Error("private storage diagnostic"));
    const query =
      kind === "baseline" ? `revision=0&baseline=${hash}` : "revision=7";
    expect(await readEditorialPreviewSource(url(query), read)).toEqual({
      status: "unavailable",
    });
  },
);

it.each(["baseline", "draft"] as const)(
  "bounds a stalled %s read at 15 seconds and clears the deadline",
  async (kind) => {
    vi.useFakeTimers();
    const read = readers();
    const stalled = new Promise<never>(() => {});
    read[kind].mockReturnValue(stalled);
    const query =
      kind === "baseline" ? `revision=0&baseline=${hash}` : "revision=7";
    const result = readEditorialPreviewSource(url(query), read);
    let settled = false;
    void result.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ status: "unavailable" });
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("clears the deadline immediately after a successful read", async () => {
  vi.useFakeTimers();
  expect(
    await readEditorialPreviewSource(
      url(`revision=0&baseline=${hash}`),
      readers(),
    ),
  ).toEqual({ status: "found", source: "published baseline" });
  expect(vi.getTimerCount()).toBe(0);
});
