import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { EditorialMediaStore, MAX_MEDIA_BYTES } from "../editorial/media-store";
import {
  OWNED_PREVIEW_BASE64_CHUNK_BYTES,
  OwnedPreviewMediaUnavailable,
  prepareOwnedPreviewMedia,
  type OwnedPreviewMediaReader,
} from "./preview-owned-media";

type File = NonNullable<Awaited<ReturnType<OwnedPreviewMediaReader>>>;
// Same real synthetic 1x1 RGB PNG used by editorial/media-store.test.ts.
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);
function file(bytes: Uint8Array = png): File {
  const id = `${createHash("sha256").update(bytes).digest("hex")}.png`;
  return { metadata: { id, type: "image/png", size: bytes.length }, bytes };
}
const source = (...files: File[]) =>
  files
    .map((value) => `![synthetic](/images/editorial/${value.metadata.id})`)
    .join("\n");
function input(files: File[], readMedia?: OwnedPreviewMediaReader) {
  return {
    source: source(...files),
    renderedIds: files.map((value) => value.metadata.id),
    readMedia:
      readMedia ??
      (async (id: string) =>
        files.find((value) => value.metadata.id === id) ?? null),
  };
}
async function text(parts: AsyncIterable<Uint8Array>) {
  let result = "";
  for await (const part of parts) result += new TextDecoder().decode(part);
  return result;
}

it("embeds each exact referenced/rendered ID once as inert bytes, without readiness or API fetches", async () => {
  const one = file();
  const other = file(new Uint8Array([1, 2, 3]));
  const read = vi.fn(async (_id: string) => one);
  const prepared = await prepareOwnedPreviewMedia({
    source: source(one, other),
    renderedIds: [one.metadata.id, one.metadata.id],
    readMedia: read,
  });
  expect(prepared.ok).toBe(true);
  if (!prepared.ok) throw new Error("expected preparation");
  expect(prepared.ids).toEqual([one.metadata.id]);
  expect(read).toHaveBeenCalledTimes(1);
  const html = await text(prepared.payloads);
  expect(html).toBe(
    `<script type="application/octet-stream" data-preview-owned-media="${one.metadata.id}" data-media-type="image/png">${png.toString("base64")}</script>`,
  );
  expect(html).not.toMatch(/ready|fetch\(|\/api\/editorial|allow-same-origin/);
  expect(read.mock.calls.map(([id]) => id)).toEqual([
    one.metadata.id,
    one.metadata.id,
  ]);
});

it.each(["foreign", "query", "invalid"])(
  "refuses %s rendered IDs before storage is read",
  async (kind) => {
    const one = file();
    const id =
      kind === "foreign"
        ? file(new Uint8Array([7])).metadata.id
        : kind === "query"
          ? `${one.metadata.id}?download=1`
          : "../private";
    const read = vi.fn();
    expect(
      await prepareOwnedPreviewMedia({
        source: source(one),
        renderedIds: [id],
        readMedia: read,
      }),
    ).toEqual({ ok: false, reason: "invalid_reference" });
    expect(read).not.toHaveBeenCalled();
  },
);

it("allows no-image snapshots without reading storage or emitting payloads", async () => {
  const read = vi.fn();
  const result = await prepareOwnedPreviewMedia({
    source: "plain text",
    renderedIds: [],
    readMedia: read,
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected empty success");
  expect(await text(result.payloads)).toBe("");
  expect(result.totalBytes).toBe(0);
  expect(read).not.toHaveBeenCalled();
});

it("uses the existing ten-image budget before any reads", async () => {
  const files = Array.from({ length: 11 }, (_, n) => file(new Uint8Array([n])));
  const read = vi.fn();
  expect(await prepareOwnedPreviewMedia(input(files, read))).toEqual({
    ok: false,
    reason: "too_many_images",
  });
  expect(read).not.toHaveBeenCalled();
  const ten = await prepareOwnedPreviewMedia(input(files.slice(0, 10)));
  expect(ten.ok).toBe(true);
});

it("admits exactly the existing 10 MiB storage budget, with bounded aligned base64 output", async () => {
  // Storage-contract boundary bytes, not a new image decoder/admission claim.
  const one = file(new Uint8Array(MAX_MEDIA_BYTES).fill(7));
  const result = await prepareOwnedPreviewMedia(input([one]));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected exact boundary");
  let count = 0;
  let encoded = 0;
  for await (const part of result.payloads) {
    count++;
    if (count === 1 || new TextDecoder().decode(part) === "</script>") continue;
    expect(part.byteLength).toBeLessThanOrEqual(
      (OWNED_PREVIEW_BASE64_CHUNK_BYTES / 3) * 4,
    );
    expect(part.byteLength % 4).toBe(0);
    encoded += part.byteLength;
  }
  expect(encoded).toBe(Math.ceil(MAX_MEDIA_BYTES / 3) * 4);
  expect(result.totalBytes).toBe(MAX_MEDIA_BYTES);
});

it("rejects individually admissible images whose aggregate exceeds the existing publication budget", async () => {
  const files = [
    file(new Uint8Array(MAX_MEDIA_BYTES)),
    file(new Uint8Array([1])),
  ];
  expect(await prepareOwnedPreviewMedia(input(files))).toEqual({
    ok: false,
    reason: "media_budget_exceeded",
  });
});

it.each(["missing", "id", "mime", "size", "fraction", "over-limit", "hash"])(
  "fails closed for %s storage results",
  async (kind) => {
    const one = file();
    let stored: File | null = {
      metadata: { ...one.metadata },
      bytes: one.bytes,
    };
    if (kind === "missing") stored = null;
    else if (kind === "id") stored.metadata.id = "a".repeat(64) + ".png";
    else if (kind === "mime") stored.metadata.type = "image/jpeg";
    else if (kind === "size") stored.metadata.size++;
    else if (kind === "fraction") stored.metadata.size += 0.5;
    else if (kind === "over-limit") stored.metadata.size = MAX_MEDIA_BYTES + 1;
    else stored.bytes = new Uint8Array(one.bytes.length).fill(9);
    expect(
      await prepareOwnedPreviewMedia(input([one], async () => stored)),
    ).toEqual({
      ok: false,
      reason: kind === "missing" ? "media_unavailable" : "invalid_media",
    });
  },
);

it("reads serially and does not start the next image until output demand reaches it", async () => {
  const files = [file(), file(new Uint8Array([1, 2, 3]))];
  let active = 0;
  let peak = 0;
  const read = vi.fn(async (id: string) => {
    peak = Math.max(peak, ++active);
    await Promise.resolve();
    active--;
    return files.find((value) => value.metadata.id === id)!;
  });
  const result = await prepareOwnedPreviewMedia(input(files, read));
  if (!result.ok) throw new Error("expected preparation");
  expect(read).toHaveBeenCalledTimes(2);
  const iterator = result.payloads[Symbol.asyncIterator]();
  await iterator.next(); // first payload header, one whole-image second read
  expect(read).toHaveBeenCalledTimes(3);
  await iterator.next(); // data only, no speculative next-image read
  expect(read).toHaveBeenCalledTimes(3);
  await iterator.next(); // closing tag
  expect(read).toHaveBeenCalledTimes(3);
  await iterator.next(); // demand starts the next image
  expect(read).toHaveBeenCalledTimes(4);
  await iterator.return?.();
  expect(peak).toBe(1);
});

it("stops after consumer cancellation without reading another image", async () => {
  const files = [file(), file(new Uint8Array([1]))];
  const read = vi.fn(input(files).readMedia);
  const result = await prepareOwnedPreviewMedia(input(files, read));
  if (!result.ok) throw new Error("expected preparation");
  const iterator = result.payloads[Symbol.asyncIterator]();
  await iterator.next();
  await iterator.return?.();
  expect((await iterator.next()).done).toBe(true);
  expect(read).toHaveBeenCalledTimes(3);
});

it("cancels a held preflight wait without leaking its late result into output or more reads", async () => {
  const one = file();
  let finish!: (value: File) => void;
  const held = new Promise<File>((resolve) => {
    finish = resolve;
  });
  const read = vi.fn(() => held);
  const controller = new AbortController();
  const prepared = prepareOwnedPreviewMedia({
    ...input([one], read),
    signal: controller.signal,
  });
  controller.abort();
  expect(await prepared).toEqual({ ok: false, reason: "aborted" });
  finish(one);
  await Promise.resolve();
  expect(read).toHaveBeenCalledTimes(1);
});

it("aborts emission between chunks with no next read or ready payload", async () => {
  const files = [file(), file(new Uint8Array([1]))];
  const read = vi.fn(input(files).readMedia);
  const controller = new AbortController();
  const result = await prepareOwnedPreviewMedia({
    ...input(files, read),
    signal: controller.signal,
  });
  if (!result.ok) throw new Error("expected preparation");
  const iterator = result.payloads[Symbol.asyncIterator]();
  await iterator.next();
  controller.abort();
  await expect(iterator.next()).rejects.toMatchObject({ reason: "aborted" });
  expect(read).toHaveBeenCalledTimes(3);
});

it("propagates a bounded late failure without emitting readiness or later images", async () => {
  const one = file();
  let calls = 0;
  const read = vi.fn(async () => {
    if (++calls === 2)
      throw new Error("private storage diagnostic never exposed");
    return one;
  });
  const result = await prepareOwnedPreviewMedia(input([one], read));
  if (!result.ok) throw new Error("expected preflight success");
  await expect(text(result.payloads)).rejects.toEqual(
    new OwnedPreviewMediaUnavailable("media_unavailable"),
  );
  expect(read).toHaveBeenCalledTimes(2);
});

it("stops a late second-image failure after a completed first payload", async () => {
  const files = [file(), file(new Uint8Array([1])), file(new Uint8Array([2]))];
  const sorted = [...files].sort((a, b) =>
    a.metadata.id.localeCompare(b.metadata.id),
  );
  let calls = 0;
  const read = vi.fn(async (id: string) => {
    calls++;
    // Three serial preflight reads, first emission read, then fail second.
    if (calls === 5) throw new Error("held storage failure");
    return files.find((value) => value.metadata.id === id)!;
  });
  const result = await prepareOwnedPreviewMedia(input(files, read));
  if (!result.ok) throw new Error("expected preflight success");
  const chunks: string[] = [];
  await expect(
    (async () => {
      for await (const chunk of result.payloads)
        chunks.push(new TextDecoder().decode(chunk));
    })(),
  ).rejects.toMatchObject({ reason: "media_unavailable" });
  const partial = chunks.join("");
  expect(partial).toContain(
    `data-preview-owned-media="${sorted[0]!.metadata.id}"`,
  );
  expect(partial.endsWith("</script>")).toBe(true);
  expect(partial).not.toContain(sorted[1]!.metadata.id);
  expect(partial).not.toContain(sorted[2]!.metadata.id);
  expect(partial).not.toContain("ready");
  expect(read).toHaveBeenCalledTimes(5);
});

it("keeps real media-store corruption checks in the read path", async () => {
  const values = new Map<string, unknown>();
  const storage = {
    get: async (key: string) => values.get(key),
    put: async (key: string, value: unknown) => {
      values.set(key, value);
    },
    transaction: async (run: (value: unknown) => Promise<void>) => run(storage),
  };
  const store = new EditorialMediaStore(
    storage as unknown as ConstructorParameters<typeof EditorialMediaStore>[0],
  );
  const saved = await store.save(png);
  if (!saved.ok) throw new Error("real synthetic PNG must be admitted");
  const one = file();
  const valid = await prepareOwnedPreviewMedia(
    input([one], (id) => store.read(id)),
  );
  expect(valid.ok).toBe(true);
  // Same-size corruption passes chunk-size checks but fails the real store hash.
  values.set(`media:${saved.media.id}:0`, new Uint8Array(png.length).fill(9));
  expect(
    await prepareOwnedPreviewMedia(input([one], (id) => store.read(id))),
  ).toEqual({ ok: false, reason: "media_unavailable" });
  values.delete(`media:${saved.media.id}:0`);
  expect(
    await prepareOwnedPreviewMedia(input([one], (id) => store.read(id))),
  ).toEqual({ ok: false, reason: "media_unavailable" });
});
