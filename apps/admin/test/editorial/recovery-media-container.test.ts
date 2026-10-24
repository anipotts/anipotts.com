/// <reference types="@cloudflare/vitest-plugin/types" />
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  RECOVERY_MEDIA_CONTAINER_LIMITS as limits,
  readRecoveryMediaManifest,
  writeRecoveryMediaContainer,
  verifyRecoveryMediaContainer,
  type RecoveryMediaObject,
  type RecoveryMediaFrame,
  type RecoveryMediaSink,
} from "../../../../scripts/admin/recovery-media-container.mjs";

// Node 24 reference for 160 canonical 64 KiB blocks, block i filled with i%251.
// These are opaque transport fixtures, not image decoder/admission fixtures.
const tenMiBHash =
  "dfe31e87c343f4f41eb627113dd7cad9a0b62100d44191375ff23077ec96d8fe";
const objects: readonly RecoveryMediaObject[] = [
  {
    plane: "private",
    id: `${tenMiBHash}.png`,
    type: "image/png",
    size: 10 * 1024 * 1024,
  },
  {
    plane: "public",
    id: `${tenMiBHash}.png`,
    type: "image/png",
    size: 10 * 1024 * 1024,
    r2: {
      etag: "synthetic-etag",
      version: "synthetic-version",
      uploaded: "2026-10-19T00:00:00.000Z",
      httpMetadata: {
        contentType: "image/png",
        cacheControl: "public, max-age=31536000, immutable",
        cacheExpiry: "2027-10-19T00:00:00.000Z",
      },
      customMetadata: { fixture: "synthetic", exact: "café\r\n雨" },
    },
  },
];

it("workerd streams 10 MiB in each plane with incremental hashes, exact metadata and one awaited frame", async () => {
  // One reused input block, no retained 20 MiB fixture or list of binary frames.
  const input = new Uint8Array(limits.frameBytes);
  let produced = 0;
  const read = async function* (object: RecoveryMediaObject) {
    for (let index = 0; index < object.size / limits.frameBytes; index++) {
      input.fill(index % 251);
      produced++;
      yield { index, bytes: input };
    }
  };
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let outstanding = 0,
    maximumOutstanding = 0,
    written = 0,
    finalized = 0;
  const writtenHashes = objects.map(() => createHash("sha256"));
  const sink: RecoveryMediaSink = {
    async writeFrame(frame) {
      outstanding++;
      maximumOutstanding = Math.max(maximumOutstanding, outstanding);
      if (written === 0) {
        entered();
        await gate;
      }
      expect(frame.objectIndex).toBe(Math.floor(written / 160));
      expect(frame.index).toBe(written % 160);
      expect(frame.bytes.byteLength).toBe(limits.frameBytes);
      writtenHashes[frame.objectIndex]!.update(frame.bytes);
      written++;
      outstanding--;
    },
    async writeManifest() {
      expect(written).toBe(320);
      finalized++;
    },
    async abort() {
      throw new Error("synthetic_unexpected_abort");
    },
  };
  const transfer = writeRecoveryMediaContainer(
    {
      objects,
      evidence: { qualification: "supplied plaintext transport only" },
    },
    read,
    sink,
  );
  await started;
  try {
    expect(produced).toBe(1);
    expect(outstanding).toBe(1);
    expect(finalized).toBe(0);
    // The module's frame copy must survive caller-buffer mutation while the
    // native sink is awaiting acknowledgment. Its first byte should remain 0.
    input.fill(255);
  } finally {
    release();
  }
  const serialized = await transfer;
  expect(maximumOutstanding).toBe(1);
  expect(produced).toBe(320);
  expect(written).toBe(320);
  expect(finalized).toBe(1);
  expect(writtenHashes.map((digest) => digest.digest("hex"))).toEqual([
    tenMiBHash,
    tenMiBHash,
  ]);
  const manifest = readRecoveryMediaManifest(serialized);
  expect(manifest.objects).toEqual(objects);
  expect(manifest.totalBytes).toBe(20 * 1024 * 1024);
  expect(manifest.totalFrames).toBe(320);

  // Regenerate the bounded deterministic fixture, rather than retain the first
  // transfer's raw bytes. Node tests separately exercise retained-frame roundtrip.
  const frames = async function* () {
    for (let objectIndex = 0; objectIndex < objects.length; objectIndex++) {
      for await (const frame of read(objects[objectIndex]!))
        yield { objectIndex, ...frame };
    }
  };
  let verifiedFrames = 0,
    verifiedManifest = 0;
  const verifiedHashes = objects.map(() => createHash("sha256"));
  await verifyRecoveryMediaContainer(serialized, frames(), {
    async writeFrame(frame) {
      expect(frame.objectIndex).toBe(Math.floor(verifiedFrames / 160));
      expect(frame.index).toBe(verifiedFrames % 160);
      verifiedHashes[frame.objectIndex]!.update(frame.bytes);
      verifiedFrames++;
    },
    async writeManifest(value) {
      expect(verifiedFrames).toBe(320);
      expect(value).toBe(serialized);
      verifiedManifest++;
    },
    async abort() {
      throw new Error("synthetic_unexpected_abort");
    },
  });
  expect(verifiedManifest).toBe(1);
  expect(verifiedHashes.map((digest) => digest.digest("hex"))).toEqual([
    tenMiBHash,
    tenMiBHash,
  ]);
});

for (const corruption of ["corrupt", "truncate"] as const) {
  it(`workerd ${corruption} input aborts staging without a final manifest`, async () => {
    const bytes = new Uint8Array(8).fill(3);
    const id = `${createHash("sha256").update(bytes).digest("hex")}.png`;
    const small: RecoveryMediaObject = {
      plane: "private",
      id,
      type: "image/png",
      size: 8,
    };
    const serialized = await writeRecoveryMediaContainer(
      { objects: [small], evidence: {} },
      async function* () {
        yield { index: 0, bytes };
      },
      { async writeFrame() {}, async writeManifest() {}, async abort() {} },
    );
    let aborted = false,
      finalized = false;
    const frames = async function* (): AsyncGenerator<RecoveryMediaFrame> {
      if (corruption === "corrupt") {
        const damaged = new Uint8Array(bytes);
        damaged[0] = 4;
        yield { objectIndex: 0, index: 0, bytes: damaged };
      }
    };
    await expect(
      verifyRecoveryMediaContainer(serialized, frames(), {
        async writeFrame() {},
        async writeManifest() {
          finalized = true;
        },
        async abort() {
          aborted = true;
        },
      }),
    ).rejects.toThrow(
      `recovery_media_container_${corruption === "corrupt" ? "object_hash" : "truncated"}`,
    );
    expect(aborted).toBe(true);
    expect(finalized).toBe(false);
  });
}
