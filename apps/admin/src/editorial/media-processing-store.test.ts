import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  commitPreparedCrop,
  mediaProcessingProvenanceKey,
  mediaProcessingRequestKey,
  parseMediaCommitReceipt,
  type MediaCommitStorage,
  type MediaCommitTransaction,
} from "./media-processing-store";
import {
  EDITORIAL_MEDIA_CHUNK_BYTES,
  inspectEditorialMediaAdmission,
  MAX_MEDIA_BYTES,
  MAX_MEDIA_PIXELS,
} from "./media-store";
import {
  preparedCropFixture,
  jpegWithComments,
  storePng,
  storeJpeg,
  storeWebp,
  storeAnimatedWebp,
  storeAlternatePng,
  faultAfterWrite,
} from "../../test/fixtures/media-processing-store";

class MemoryTransactions implements MediaCommitStorage {
  values = new Map<string, unknown>();
  transactions = 0;
  writes = 0;
  beforeFirstRead?: () => Promise<void>;
  private pending = Promise.resolve();
  async transaction<T>(
    callback: (transaction: MediaCommitTransaction) => Promise<T>,
  ) {
    this.transactions++;
    const previous = this.pending;
    let release!: () => void;
    this.pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const working = structuredClone(this.values);
    let first = true;
    const transaction: MediaCommitTransaction = {
      get: async <T>(key: string) => {
        if (first) {
          first = false;
          await this.beforeFirstRead?.();
        }
        return structuredClone(working.get(key)) as T | undefined;
      },
      put: async (key, value) => {
        this.writes++;
        working.set(key, structuredClone(value));
      },
      list: async <T>({ prefix, limit }: { prefix: string; limit: number }) =>
        new Map(
          [...working.entries()]
            .filter(([key]) => key.startsWith(prefix))
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, limit)
            .map(([key, value]) => [key, structuredClone(value) as T]),
        ),
    };
    try {
      const result = await callback(transaction);
      this.values = working;
      return result;
    } finally {
      release();
    }
  }
}
const request = (
  originalBytes = new Uint8Array(storeJpeg),
  output = new Uint8Array(storePng),
) => ({
  requestId: crypto.randomUUID(),
  originalBytes,
  candidate: preparedCropFixture(originalBytes, output),
});
const clone = <T>(value: T): T => structuredClone(value);
function assertImage(
  values: Map<string, unknown>,
  id: string,
  bytes: Uint8Array,
) {
  expect(values.get(`media:${id}`)).toEqual({
    id,
    type: id.endsWith(".png") ? "image/png" : "image/jpeg",
    size: bytes.length,
  });
  const joined = new Uint8Array(bytes.length);
  for (
    let offset = 0;
    offset < bytes.length;
    offset += EDITORIAL_MEDIA_CHUNK_BYTES
  ) {
    const chunk = values.get(
      `media:${id}:${offset / EDITORIAL_MEDIA_CHUNK_BYTES}`,
    );
    expect(chunk).toBeInstanceOf(Uint8Array);
    joined.set(chunk as Uint8Array, offset);
  }
  expect(joined).toEqual(bytes);
  expect(id.split(".")[0]).toBe(
    createHash("sha256").update(joined).digest("hex"),
  );
}

describe("unconnected atomic private-media persistence", () => {
  it("preserves existing original admission types, errors, limits and byte identities", () => {
    expect(MAX_MEDIA_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_MEDIA_PIXELS).toBe(16 * 1024 * 1024);
    expect(EDITORIAL_MEDIA_CHUNK_BYTES).toBe(64 * 1024);
    for (const [bytes, type] of [
      [storeJpeg, "image/jpeg"],
      [storePng, "image/png"],
      [storeWebp, "image/webp"],
      [storeAnimatedWebp, "image/webp"],
    ] as const) {
      const admitted = inspectEditorialMediaAdmission(bytes);
      expect(admitted).toMatchObject({
        ok: true,
        media: { type, size: bytes.length },
        dimensions: { width: 1, height: 1 },
      });
      if (admitted.ok)
        expect(admitted.media.id.split(".")[0]).toBe(
          createHash("sha256").update(bytes).digest("hex"),
        );
    }
    const declared = new Uint8Array(storePng);
    const view = new DataView(declared.buffer);
    view.setUint32(16, 4096);
    view.setUint32(20, 4096);
    expect(inspectEditorialMediaAdmission(declared)).toMatchObject({
      ok: true,
      dimensions: { width: 4096, height: 4096 },
    });
    view.setUint32(16, 4097);
    expect(inspectEditorialMediaAdmission(declared)).toEqual({
      ok: false,
      error: "image_too_large",
    });
    // Deliberately header-only evidence, matching legacy admission rather than claiming decoded pixels.
    expect(
      inspectEditorialMediaAdmission(new Uint8Array(MAX_MEDIA_BYTES + 1)),
    ).toEqual({ ok: false, error: "image_too_large" });
    expect(
      inspectEditorialMediaAdmission(new Uint8Array([255, 216, 255, 217])),
    ).toEqual({ ok: false, error: "unsupported_image" });
  });
  it("commits exact original, derivative, edge and canonical replay receipt together", async () => {
    const memory = new MemoryTransactions(),
      input = request(jpegWithComments());
    const receipt = await commitPreparedCrop(memory, input);
    expect(parseMediaCommitReceipt(receipt)).toEqual(receipt);
    assertImage(memory.values, receipt.parentId, input.originalBytes);
    assertImage(memory.values, receipt.derivativeId, input.candidate.bytes);
    expect(
      memory.values.get(
        mediaProcessingProvenanceKey(input.candidate.provenance),
      ),
    ).toEqual(input.candidate.provenance);
    expect(
      memory.values.get(mediaProcessingRequestKey(input.requestId)),
    ).toEqual(receipt);
    memory.values.set(
      mediaProcessingRequestKey(input.requestId),
      Object.fromEntries(Object.entries(receipt).reverse()),
    );
    const writes = memory.writes,
      before = clone(memory.values);
    expect(await commitPreparedCrop(memory, input)).toEqual(receipt);
    expect(memory.writes).toBe(writes);
    expect(memory.values).toEqual(before);
  });
  it("reuses a legacy original without rewriting it or requiring invented historical provenance", async () => {
    const memory = new MemoryTransactions(),
      input = request(jpegWithComments());
    const parent = input.candidate.decode.original;
    memory.values.set(`media:${parent.id}`, { ...parent });
    for (
      let offset = 0;
      offset < input.originalBytes.length;
      offset += EDITORIAL_MEDIA_CHUNK_BYTES
    )
      memory.values.set(
        `media:${parent.id}:${offset / EDITORIAL_MEDIA_CHUNK_BYTES}`,
        input.originalBytes.slice(offset, offset + EDITORIAL_MEDIA_CHUNK_BYTES),
      );
    await commitPreparedCrop(
      faultAfterWrite(memory, `media:${parent.id}`),
      input,
    );
    assertImage(memory.values, parent.id, input.originalBytes);
  });
  it("rolls back failures at each object/edge/receipt write, preserving unrelated values", async () => {
    const input = request(jpegWithComments());
    const points = [
      `media:${input.candidate.decode.original.id}:0`,
      `media:${input.candidate.decode.original.id}`,
      `media:${input.candidate.media.id}`,
      mediaProcessingProvenanceKey(input.candidate.provenance),
      mediaProcessingRequestKey(input.requestId),
    ];
    for (const point of points) {
      const memory = new MemoryTransactions();
      memory.values.set("unrelated", { retained: true });
      const before = clone(memory.values);
      await expect(
        commitPreparedCrop(faultAfterWrite(memory, point), input),
      ).rejects.toThrow("synthetic_write_failure");
      expect(memory.values).toEqual(before);
    }
  });
  it("serializes identical concurrent requests and rejects changed candidates for the same request", async () => {
    const memory = new MemoryTransactions(),
      input = request();
    const receipts = await Promise.all([
      commitPreparedCrop(memory, input),
      commitPreparedCrop(memory, clone(input)),
    ]);
    expect(receipts[0]).toEqual(receipts[1]);
    const before = clone(memory.values);
    const changed = request(input.originalBytes, storeAlternatePng);
    changed.requestId = input.requestId;
    await expect(commitPreparedCrop(memory, changed)).rejects.toMatchObject({
      code: "request_conflict",
    });
    expect(memory.values).toEqual(before);
  });
  it("recovers a committed-but-lost acknowledgement from its receipt without rewriting", async () => {
    const memory = new MemoryTransactions(),
      input = request();
    const uncertain: MediaCommitStorage = {
      async transaction(callback) {
        await memory.transaction(callback);
        throw new Error("synthetic_ack_lost");
      },
    };
    await expect(commitPreparedCrop(uncertain, input)).rejects.toThrow(
      "synthetic_ack_lost",
    );
    const writes = memory.writes;
    const receipt = await commitPreparedCrop(memory, input);
    expect(receipt).toEqual(
      memory.values.get(mediaProcessingRequestKey(input.requestId)),
    );
    expect(memory.writes).toBe(writes);
  });
  it("preserves separate edges for shared derivatives and permits exact self identity", async () => {
    const memory = new MemoryTransactions(),
      left = request(),
      right = request(jpegWithComments(1));
    const a = await commitPreparedCrop(memory, left),
      b = await commitPreparedCrop(memory, right);
    expect(a.derivativeId).toBe(b.derivativeId);
    expect(a.parentId).not.toBe(b.parentId);
    expect(a.provenanceId).not.toBe(b.provenanceId);
    expect(
      [...memory.values.keys()].filter((key) =>
        key.startsWith("media-processing-provenance:"),
      ),
    ).toHaveLength(2);
    const self = request(new Uint8Array(storePng), new Uint8Array(storePng));
    const receipt = await commitPreparedCrop(memory, self);
    expect(receipt.parentId).toBe(receipt.derivativeId);
    assertImage(memory.values, receipt.parentId, self.originalBytes);
  });
  it("snapshots caller bytes, plan, proof and request identity before held storage reads", async () => {
    const memory = new MemoryTransactions(),
      input = request(jpegWithComments());
    const expected = clone(input);
    let entered!: () => void, release!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    memory.beforeFirstRead = async () => {
      entered();
      await held;
    };
    const pending = commitPreparedCrop(memory, input);
    await waiting;
    input.originalBytes.fill(0);
    input.candidate.bytes.fill(0);
    input.candidate.provenance.plan.output.width = 9;
    input.candidate.decode.original.id = `${"0".repeat(64)}.jpg`;
    input.requestId = crypto.randomUUID();
    release();
    const receipt = await pending;
    expect(receipt.requestId).toBe(expected.requestId);
    assertImage(memory.values, receipt.parentId, expected.originalBytes);
    assertImage(memory.values, receipt.derivativeId, expected.candidate.bytes);
    expect(
      memory.values.get(
        mediaProcessingProvenanceKey(expected.candidate.provenance),
      ),
    ).toEqual(expected.candidate.provenance);
  });
  it("rejects signature-only originals, changed metadata, mismatched geometry and unknown input fields before any transaction", async () => {
    const valid = request();
    const bad = [
      { ...clone(valid), originalBytes: new Uint8Array([255, 216, 255, 217]) },
      { ...clone(valid), requestId: "../unknown" },
      { ...clone(valid), extra: true },
      {
        ...clone(valid),
        candidate: { ...clone(valid.candidate), extra: true },
      },
    ];
    const wrongSize = clone(valid);
    wrongSize.candidate.media.size++;
    bad.push(wrongSize);
    const wrongDisplay = clone(valid);
    wrongDisplay.candidate.decode.display.width++;
    bad.push(wrongDisplay);
    const wrongDepth = clone(valid);
    wrongDepth.candidate.decode.discardedPng.bitDepth = 7;
    bad.push(wrongDepth);
    for (const input of bad) {
      const memory = new MemoryTransactions();
      await expect(commitPreparedCrop(memory, input)).rejects.toBeInstanceOf(
        Error,
      );
      expect(memory.transactions).toBe(0);
      expect(memory.values.size).toBe(0);
    }
  });
  it("rejects corrupt existing bytes, orphan/extra chunks, metadata and incomplete committed state without repair", async () => {
    const input = request(),
      originalId = input.candidate.decode.original.id;
    const corruptions = [
      (values: Map<string, unknown>) =>
        values.set(`media:${originalId}:0`, new Uint8Array([0])),
      (values: Map<string, unknown>) =>
        values.set(`media:${originalId}:999`, new Uint8Array([0])),
      (values: Map<string, unknown>) =>
        values.set(`media:${originalId}`, {
          id: originalId,
          type: "image/png",
          size: input.originalBytes.length,
        }),
      (values: Map<string, unknown>) => values.delete(`media:${originalId}`),
      (values: Map<string, unknown>) =>
        values.delete(mediaProcessingProvenanceKey(input.candidate.provenance)),
      (values: Map<string, unknown>) =>
        values.set(mediaProcessingRequestKey(input.requestId), {
          version: "unknown",
        }),
      (values: Map<string, unknown>) =>
        values.set(mediaProcessingProvenanceKey(input.candidate.provenance), {
          version: "unknown",
        }),
    ];
    for (const corrupt of corruptions) {
      const memory = new MemoryTransactions();
      await commitPreparedCrop(memory, input);
      corrupt(memory.values);
      const before = clone(memory.values),
        writes = memory.writes;
      await expect(commitPreparedCrop(memory, input)).rejects.toBeInstanceOf(
        Error,
      );
      expect(memory.values).toEqual(before);
      expect(memory.writes).toBe(writes);
    }
    const orphan = new MemoryTransactions();
    orphan.values.set(`media:${originalId}:0`, input.originalBytes);
    const before = clone(orphan.values);
    await expect(commitPreparedCrop(orphan, input)).rejects.toMatchObject({
      code: "stored_media_corrupt",
    });
    expect(orphan.values).toEqual(before);
  });
});
