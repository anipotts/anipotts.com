import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  RECOVERY_MEDIA_CONTAINER_LIMITS as limits,
  readRecoveryMediaManifest,
  writeRecoveryMediaContainer,
  verifyRecoveryMediaContainer,
} from "./recovery-media-container.mjs";

function block(index, size) {
  return new Uint8Array(size).fill(index % 251);
}
function object(size, plane = "private") {
  const digest = createHash("sha256");
  for (let offset = 0, index = 0; offset < size; offset += limits.frameBytes)
    digest.update(block(index++, Math.min(limits.frameBytes, size - offset)));
  return {
    plane,
    id: `${digest.digest("hex")}.png`,
    type: "image/png",
    size,
    ...(plane === "public"
      ? {
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
        }
      : {}),
  };
}
async function* reader(object) {
  for (
    let offset = 0, index = 0;
    offset < object.size;
    offset += limits.frameBytes, index++
  )
    yield {
      index,
      bytes: block(index, Math.min(limits.frameBytes, object.size - offset)),
    };
}
async function* sequence(frames) {
  yield* frames;
}
function sink() {
  return {
    frames: [],
    manifests: [],
    aborted: false,
    async writeFrame(frame) {
      this.frames.push(frame);
    },
    async writeManifest(serialized) {
      this.manifests.push(serialized);
    },
    async abort() {
      this.aborted = true;
    },
  };
}
async function supplied(objects = [object(limits.frameBytes + 7)]) {
  const output = sink();
  const manifest = await writeRecoveryMediaContainer(
    { objects, evidence: { fixture: "synthetic transport, no capture claim" } },
    reader,
    output,
  );
  return { output, manifest };
}

test("10 MiB in both planes round-trips exact binary frames, private order and public metadata", async () => {
  const objects = [
    object(limits.objectBytes),
    object(limits.objectBytes, "public"),
  ];
  const { output, manifest } = await supplied(objects);
  assert.equal(output.frames.length, 320);
  assert.equal(output.manifests.length, 1);
  const inventory = readRecoveryMediaManifest(manifest);
  assert.deepEqual(inventory.objects, objects);
  assert.equal(inventory.totalBytes, 20 * 1024 * 1024);
  assert.equal(inventory.totalFrames, 320);
  let offset = 0;
  const digests = objects.map(() => createHash("sha256"));
  const verified = {
    async writeFrame(frame) {
      assert.equal(frame.bytes.byteLength, limits.frameBytes);
      assert.deepEqual(frame.bytes, block(frame.index, limits.frameBytes));
      digests[frame.objectIndex].update(frame.bytes);
      offset++;
    },
    async writeManifest(serialized) {
      assert.equal(offset, 320);
      assert.equal(serialized, manifest);
    },
    async abort() {
      assert.fail("valid supplied transport must not abort");
    },
  };
  await verifyRecoveryMediaContainer(
    manifest,
    sequence(output.frames),
    verified,
  );
  assert.deepEqual(
    digests.map((digest) => `${digest.digest("hex")}.png`),
    objects.map((object) => object.id),
  );
});

test("awaited backpressure admits one frame and snapshots metadata before any reader await", async () => {
  const plan = {
    objects: [object(limits.frameBytes + 1, "public")],
    evidence: { fixture: "original" },
  };
  const expected = structuredClone(plan);
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  let reads = 0,
    outstanding = 0,
    maximum = 0;
  const output = sink();
  output.writeFrame = async (frame) => {
    outstanding++;
    maximum = Math.max(maximum, outstanding);
    entered();
    await gate;
    output.frames.push(frame);
    outstanding--;
  };
  const writing = writeRecoveryMediaContainer(
    plan,
    async function* (object) {
      for await (const frame of reader(object)) {
        reads++;
        yield frame;
        // Mutating/reusing a caller buffer after its awaited write cannot alter
        // a frame already handed to the sink or its final object hash.
        frame.bytes.fill(255);
      }
    },
    output,
  );
  plan.objects[0].r2.customMetadata.fixture = "changed";
  plan.objects.pop();
  plan.evidence.fixture = "changed";
  await started;
  assert.equal(reads, 1);
  assert.equal(outstanding, 1);
  assert.equal(output.manifests.length, 0);
  release();
  const manifest = await writing;
  assert.equal(maximum, 1);
  assert.equal(reads, 2);
  assert.deepEqual(output.frames[0].bytes, block(0, limits.frameBytes));
  assert.deepEqual(
    readRecoveryMediaManifest(manifest).objects,
    expected.objects,
  );
  assert.deepEqual(
    readRecoveryMediaManifest(manifest).evidence,
    expected.evidence,
  );
});

for (const [name, alter] of [
  ["corrupt bytes", (frames) => frames[0].bytes.fill(255)],
  [
    "truncated last frame",
    (frames) => (frames.at(-1).bytes = new Uint8Array(6)),
  ],
  ["missing last frame", (frames) => frames.pop()],
  ["duplicate frame", (frames) => frames.splice(1, 0, frames[0])],
  ["reordered private frames", (frames) => frames.reverse()],
  ["wrong plane order", (frames) => (frames[0].objectIndex = 1)],
  ["trailing frame after exact EOF", (frames) => frames.push(frames[0])],
]) {
  test(`verification refuses ${name} without publishing a complete manifest`, async () => {
    const { output, manifest } = await supplied();
    alter(output.frames);
    const target = sink();
    await assert.rejects(
      verifyRecoveryMediaContainer(manifest, sequence(output.frames), target),
      /recovery_media_container_/,
    );
    assert.equal(target.aborted, true);
    assert.deepEqual(target.manifests, []);
  });
}

for (const [name, read] of [
  ["truncated source", async function* () {}],
  [
    "oversized source fragment",
    async function* () {
      yield { index: 0, bytes: new Uint8Array(limits.frameBytes + 1) };
    },
  ],
  [
    "wrong source hash",
    async function* () {
      yield { index: 0, bytes: block(1, 8) };
    },
  ],
  [
    "duplicate source chunk",
    async function* () {
      yield { index: 0, bytes: block(0, 8) };
      yield { index: 0, bytes: block(0, 8) };
    },
  ],
]) {
  test(`writer refuses ${name} and closes the supplied iterator`, async () => {
    const output = sink();
    let closed = false;
    await assert.rejects(
      writeRecoveryMediaContainer(
        { objects: [object(8)], evidence: {} },
        async function* () {
          try {
            yield* read();
          } finally {
            closed = true;
          }
        },
        output,
      ),
      /recovery_media_container_/,
    );
    assert.equal(closed, true);
    assert.equal(output.aborted, true);
    assert.deepEqual(output.manifests, []);
  });
}

function declared(size, index = 0) {
  return {
    plane: "private",
    id: `${index.toString(16).padStart(64, "0")}.png`,
    type: "image/png",
    size,
  };
}
for (const [name, objects, evidence] of [
  ["object limit plus one", [declared(limits.objectBytes + 1)], {}],
  [
    "aggregate limit plus one",
    [
      ...Array.from({ length: 6 }, (_, index) =>
        declared(limits.objectBytes, index),
      ),
      declared(4 * 1024 * 1024 + 1, 6),
    ],
    {},
  ],
  [
    "entry limit plus one",
    Array.from({ length: 5001 }, (_, i) => declared(1, i)),
    {},
  ],
  ["duplicate same-plane identity", [declared(1), declared(1)], {}],
  [
    "separate evidence limit",
    [declared(1)],
    { text: "e".repeat(limits.evidenceBytes) },
  ],
  [
    "separate metadata limit",
    [
      {
        ...object(1, "public"),
        r2: {
          ...object(1, "public").r2,
          customMetadata: Object.fromEntries(
            Array.from({ length: 1100 }, (_, index) => [
              String(index),
              "m".repeat(4096),
            ]),
          ),
        },
      },
    ],
    {},
  ],
  ["unknown private metadata", [{ ...declared(1), r2: {} }], {}],
  ["unknown public metadata", [{ ...object(1, "public"), surprise: true }], {}],
]) {
  test(`preflight rejects ${name} before opening a reader or writing`, async () => {
    const output = sink();
    let reads = 0;
    await assert.rejects(
      writeRecoveryMediaContainer(
        { objects, evidence },
        () => {
          reads++;
          return reader(objects[0]);
        },
        output,
      ),
      /recovery_media_container_/,
    );
    assert.equal(reads, 0);
    assert.deepEqual(output.frames, []);
    assert.deepEqual(output.manifests, []);
  });
}

test("exact aggregate and entry bounds are admitted, with no declared-size allocation", async () => {
  for (const objects of [
    [
      ...Array.from({ length: 6 }, (_, index) =>
        declared(limits.objectBytes, index),
      ),
      declared(4 * 1024 * 1024, 6),
    ],
    Array.from({ length: 5000 }, (_, index) => declared(1, index)),
  ]) {
    await assert.rejects(
      writeRecoveryMediaContainer(
        { objects, evidence: {} },
        () => {
          throw new Error("synthetic_reader_opened");
        },
        sink(),
      ),
      /synthetic_reader_opened/,
    );
  }
});

test("strict canonical manifest rejects unsupported versions, unknown fields and count/checksum changes", async () => {
  const { manifest } = await supplied([object(8)]);
  for (const change of [
    (value) => (value.version = 2),
    (value) => (value.unknown = true),
    (value) => value.totalBytes++,
    (value) => value.totalFrames++,
    (value) => (value.sha256 = "a".repeat(64)),
    (value) => (value.objects[0].id = `${"a".repeat(64)}.png`),
  ]) {
    const value = JSON.parse(manifest);
    change(value);
    assert.throws(() => readRecoveryMediaManifest(JSON.stringify(value)));
  }
  assert.throws(() => readRecoveryMediaManifest(` ${manifest}`));
  assert.throws(() =>
    readRecoveryMediaManifest(`${manifest.slice(0, -1)},"version":1}`),
  );
});

test("sink failure cancels source, aborts staging and never emits a final manifest", async () => {
  const output = sink();
  output.writeFrame = async () => {
    throw new Error("synthetic_sink_failure");
  };
  let closed = false;
  await assert.rejects(
    writeRecoveryMediaContainer(
      { objects: [object(limits.frameBytes + 1)], evidence: {} },
      async function* (object) {
        try {
          yield* reader(object);
        } finally {
          closed = true;
        }
      },
      output,
    ),
    /synthetic_sink_failure/,
  );
  assert.equal(closed, true);
  assert.equal(output.aborted, true);
  assert.deepEqual(output.manifests, []);
});

test("source byte getters are captured once and cannot substitute an oversized copy", async () => {
  const output = sink();
  let accesses = 0;
  const payload = {
    index: 0,
    get bytes() {
      accesses++;
      return accesses === 1
        ? block(0, 8)
        : new Uint8Array(limits.frameBytes + 1);
    },
  };
  await writeRecoveryMediaContainer(
    { objects: [object(8)], evidence: {} },
    async function* () {
      yield payload;
    },
    output,
  );
  assert.equal(accesses, 1);
  assert.equal(output.frames[0].bytes.byteLength, 8);
  assert.equal(output.manifests.length, 1);
});

test("typed-array subclasses cannot forge byte length to bypass the frame bound", async () => {
  class MisleadingBytes extends Uint8Array {
    get byteLength() {
      return 8;
    }
  }
  const output = sink();
  await assert.rejects(
    writeRecoveryMediaContainer(
      { objects: [object(8)], evidence: {} },
      async function* () {
        yield { index: 0, bytes: new MisleadingBytes(limits.frameBytes + 1) };
      },
      output,
    ),
    /recovery_media_container_frame/,
  );
  assert.deepEqual(output.frames, []);
  assert.deepEqual(output.manifests, []);
});

test("a late source error after the last valid byte prevents finalization", async () => {
  const output = sink();
  await assert.rejects(
    writeRecoveryMediaContainer(
      { objects: [object(8)], evidence: {} },
      async function* (object) {
        yield* reader(object);
        throw new Error("synthetic_late_source_error");
      },
      output,
    ),
    /synthetic_late_source_error/,
  );
  assert.equal(output.frames.length, 1);
  assert.equal(output.aborted, true);
  assert.deepEqual(output.manifests, []);
});

test("a late transport error after all declared frames prevents verification finalization", async () => {
  const { output, manifest } = await supplied([object(8)]);
  const target = sink();
  await assert.rejects(
    verifyRecoveryMediaContainer(
      manifest,
      (async function* () {
        yield* output.frames;
        throw new Error("synthetic_late_transport_error");
      })(),
      target,
    ),
    /synthetic_late_transport_error/,
  );
  assert.equal(target.frames.length, 1);
  assert.equal(target.aborted, true);
  assert.deepEqual(target.manifests, []);
});
