import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createR2RecoveryArtifact,
  openR2RecoveryArtifact,
  RECOVERY_ARTIFACT_R2_LIMITS as limits,
} from "../../apps/admin/src/editorial/recovery-artifact-r2.ts";

// Synthetic transport only. Crypto/actual R2/suspended restore are qualified by
// the isolated native suite, not by this map or the opaque ciphertext fixtures.
function bucket() {
  const objects = new Map();
  let revision = 0,
    outstanding = 0,
    maximum = 0,
    largestPut = 0;
  const api = {
    objects,
    beforePut: null,
    afterPut: null,
    beforeGet: null,
    corruptRead: null,
    async put(key, value, options) {
      maximum = Math.max(maximum, ++outstanding);
      largestPut = Math.max(largestPut, value.byteLength);
      try {
        await api.beforePut?.(key);
        assert.equal(options.onlyIf.etagDoesNotMatch, "*");
        if (objects.has(key)) return null;
        const entry = api.replace(key, value);
        await api.afterPut?.(key);
        return entry;
      } finally {
        outstanding--;
      }
    },
    async get(key, options) {
      await api.beforeGet?.(key);
      const entry = objects.get(key);
      if (!entry) return null;
      if (options.onlyIf.etagMatches !== entry.etag) return entry;
      const bytes = api.corruptRead?.(key, entry.bytes) ?? entry.bytes;
      return {
        ...entry,
        body: new ReadableStream({
          start(controller) {
            for (let offset = 0; offset < bytes.length; offset += 32768)
              controller.enqueue(bytes.subarray(offset, offset + 32768));
            controller.close();
          },
        }),
      };
    },
    replace(key, bytes) {
      const owned = Uint8Array.from(bytes);
      const entry = {
        bytes: owned,
        size: owned.length,
        etag: createHash("sha256").update(owned).digest("hex"),
        version: String(++revision),
      };
      objects.set(key, entry);
      return entry;
    },
    stats() {
      return { maximum, largestPut };
    },
  };
  return api;
}
const header = () => ({
  kind: "header",
  serialized: "synthetic opaque encrypted header",
});
const record = (sequence, role = "media", length = 7) => ({
  kind: "record",
  role,
  sequence,
  objectIndex: role === "media" ? 0 : -1,
  index: 0,
  length,
  ciphertext: new Uint8Array(length).fill(sequence % 255),
  tag: new Uint8Array(16).fill(91),
});
const receipt = (records = 2) => ({
  mediaBytes: 7,
  mediaFrames: 1,
  manifestBytes: 7,
  manifestHash: "a".repeat(64),
  records,
  transcript: "b".repeat(64),
  controlBytes: 7,
  controlHash: "c".repeat(64),
});
const signal = () => new AbortController().signal;
async function sealed(b = bucket(), id = "synthetic", records = 2) {
  const writer = createR2RecoveryArtifact(b, id),
    sig = signal();
  await writer.write(header(), sig);
  for (let index = 1; index <= records; index++) {
    const event = record(
      index,
      records > 5000 && index === 1
        ? "control"
        : records > 5000 && index === records
          ? "manifest"
          : "media",
    );
    if (records > 5000 && event.role === "media") event.objectIndex = index - 2;
    await writer.write(event, sig);
  }
  await writer.write(record(records + 1, "commit"), sig);
  await writer.complete(receipt(records), sig);
  return { b, writer, descriptor: writer.descriptor() };
}
const collect = async (source) => {
  const events = [];
  for await (const event of source()) events.push(event);
  return events;
};
const key = (id, tail) => `editorial-recovery-artifacts/v1/${id}/${tail}`;
function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

test("artifact binary event bytes round trip and replay independently with one awaited put", async () => {
  const { b, writer, descriptor } = await sealed();
  const first = await collect(writer.source),
    second = await collect(openR2RecoveryArtifact(b, descriptor));
  assert.deepEqual(first, [
    header(),
    record(1),
    record(2),
    record(3, "commit"),
  ]);
  first[1].ciphertext.fill(0);
  assert.deepEqual(second[1], record(1));
  assert.equal(b.stats().maximum, 1);
  assert.ok(b.stats().largestPut <= limits.eventBytes);
});
test("many small objects exceed 5000 events without an oversized metadata array", async () => {
  const { b, descriptor } = await sealed(bucket(), "many-small", 5002);
  let count = 0;
  for await (const event of openR2RecoveryArtifact(b, descriptor)()) {
    assert.equal(event.kind === "header" ? 0 : event.sequence, count++);
  }
  assert.equal(count, 5004);
  const shards = [...b.objects.entries()].filter(([name]) =>
    name.includes("/shards/"),
  );
  assert.equal(shards.length, Math.ceil(count / limits.shardEntries));
  for (const [, value] of shards) {
    assert.ok(JSON.parse(Buffer.from(value.bytes)).length <= 128);
    assert.ok(value.bytes.length <= limits.shardBytes);
  }
});
test("derived maximum is enforced including aggregate, small object, manifest and control frames", async () => {
  assert.ok(limits.events > 5000 + 1024 + 64);
  const b = bucket(),
    writer = createR2RecoveryArtifact(b, "limit"),
    sig = signal();
  await writer.write(header(), sig);
  for (let index = 1; index < limits.events; index++)
    await writer.write(record(index), sig);
  await assert.rejects(writer.write(record(limits.events), sig), /bounds/);
  assert.throws(() => writer.descriptor(), /incomplete/);
  assert.equal(b.objects.has(key("limit", "index")), false);
});
test("ciphertext and tag are copied before the first storage await", async () => {
  const b = bucket(),
    writer = createR2RecoveryArtifact(b, "copy"),
    sig = signal();
  await writer.write(header(), sig);
  const hold = deferred(),
    entered = deferred();
  b.beforePut = async (name) => {
    if (name.endsWith("events/1")) {
      entered.resolve();
      await hold.promise;
    }
  };
  const event = record(1),
    expected = structuredClone(event);
  const pending = writer.write(event, sig);
  await entered.promise;
  event.ciphertext.fill(0);
  event.tag.fill(0);
  hold.resolve();
  await pending;
  await writer.write(record(2), sig);
  await writer.write(record(3, "commit"), sig);
  await writer.complete(receipt(), sig);
  assert.deepEqual((await collect(writer.source))[1], expected);
});
test("typed array subclasses cannot forge the owned allocation bound", async () => {
  class Forged extends Uint8Array {
    get byteLength() {
      return 1;
    }
  }
  const writer = createR2RecoveryArtifact(bucket(), "forged"),
    sig = signal();
  await writer.write(header(), sig);
  await assert.rejects(
    writer.write({ ...record(1), ciphertext: new Forged(65537) }, sig),
    /bounds/,
  );
});
test("conditional claim and event collisions preserve existing bytes", async () => {
  const { b, writer } = await sealed();
  const before = await collect(writer.source);
  await assert.rejects(
    createR2RecoveryArtifact(b, "synthetic").write(header(), signal()),
    /collision/,
  );
  assert.deepEqual(await collect(writer.source), before);
  const orphan = Uint8Array.of(1, 2, 3);
  b.replace(key("orphan", "events/0"), orphan);
  await assert.rejects(
    createR2RecoveryArtifact(b, "orphan").write(header(), signal()),
    /collision/,
  );
  assert.deepEqual(b.objects.get(key("orphan", "events/0")).bytes, orphan);
});
for (const mode of [
  "missing",
  "etag",
  "same-bytes-new-version",
  "truncated",
  "corrupt",
  "too-long",
]) {
  test(`pinned reads refuse ${mode} event objects`, async () => {
    const { b, descriptor } = await sealed();
    const name = key("synthetic", "events/1"),
      bytes = b.objects.get(name).bytes;
    if (mode === "missing") b.objects.delete(name);
    else if (mode === "etag") b.replace(name, Uint8Array.of(0));
    else if (mode === "same-bytes-new-version") b.replace(name, bytes);
    else
      b.corruptRead = (readKey, raw) =>
        readKey !== name
          ? raw
          : mode === "truncated"
            ? raw.subarray(0, raw.length - 1)
            : mode === "too-long"
              ? new Uint8Array(raw.length + 1)
              : new Uint8Array(raw.length).fill(0);
    await assert.rejects(
      collect(openR2RecoveryArtifact(b, descriptor)),
      /changed|integrity|length/,
    );
  });
}
test("index and shards are pinned on every replay, including same-byte rewrites", async () => {
  for (const tail of ["index", "shards/0"]) {
    const { b, descriptor } = await sealed();
    await collect(openR2RecoveryArtifact(b, descriptor));
    const name = key("synthetic", tail);
    b.replace(name, b.objects.get(name).bytes);
    await assert.rejects(
      collect(openR2RecoveryArtifact(b, descriptor)),
      /changed/,
    );
  }
});
test("descriptor is copied before any await and root canonical shape is exact", async () => {
  const { b, descriptor } = await sealed();
  const mutable = structuredClone(descriptor),
    source = openR2RecoveryArtifact(b, mutable);
  mutable.index.sha256 = "0".repeat(64);
  mutable.artifactId = "other";
  assert.equal((await collect(source)).length, 4);
  assert.throws(
    () => openR2RecoveryArtifact(b, { ...descriptor, unknown: 1 }),
    /schema/,
  );
  const root = JSON.parse(
    Buffer.from(b.objects.get(key("synthetic", "index")).bytes),
  );
  root.unknown = true;
  const bytes = Buffer.from(JSON.stringify(root));
  const object = b.replace(key("synthetic", "index"), bytes);
  await assert.rejects(
    collect(
      openR2RecoveryArtifact(b, {
        ...descriptor,
        index: {
          size: object.size,
          etag: object.etag,
          version: object.version,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      }),
    ),
    /canonical|schema/,
  );
});
test("no committed index after write failure and abort preserves partial ciphertext", async () => {
  const b = bucket(),
    writer = createR2RecoveryArtifact(b, "partial"),
    sig = signal();
  await writer.write(header(), sig);
  b.beforePut = async (name) => {
    if (name.endsWith("events/1")) throw new Error("synthetic_quota");
  };
  await assert.rejects(writer.write(record(1), sig), /synthetic_quota/);
  await writer.abort();
  assert.ok(b.objects.has(key("partial", "events/0")));
  assert.equal(b.objects.has(key("partial", "index")), false);
  assert.throws(() => writer.descriptor(), /incomplete/);
  await assert.rejects(writer.write(record(1), sig), /state/);
});
test("held final index acknowledgment then cancellation cannot return success even if R2 later persisted", async () => {
  const b = bucket(),
    writer = createR2RecoveryArtifact(b, "late"),
    controller = new AbortController();
  const sig = controller.signal;
  await writer.write(header(), sig);
  await writer.write(record(1), sig);
  await writer.write(record(2), sig);
  await writer.write(record(3, "commit"), sig);
  const entered = deferred(),
    hold = deferred();
  b.afterPut = async (name) => {
    if (name.endsWith("/index")) {
      entered.resolve();
      await hold.promise;
    }
  };
  const pending = writer.complete(receipt(), sig);
  await entered.promise;
  controller.abort();
  hold.resolve();
  await assert.rejects(pending, /aborted/);
  assert.throws(() => writer.descriptor(), /incomplete/);
  assert.ok(
    b.objects.has(key("late", "index")),
    "ambiguous late persisted artifact is preserved",
  );
});
test("concurrent writes fail closed and never acknowledge an incomplete artifact", async () => {
  const b = bucket(),
    writer = createR2RecoveryArtifact(b, "overlap"),
    entered = deferred(),
    hold = deferred();
  b.beforePut = async () => {
    entered.resolve();
    await hold.promise;
  };
  const first = writer.write(header(), signal());
  await entered.promise;
  await assert.rejects(writer.write(header(), signal()), /state/);
  hold.resolve();
  await assert.rejects(first, /state/);
  assert.throws(() => writer.descriptor(), /incomplete/);
});
test("commit must be last, final count must match, malformed identity never touches R2", async () => {
  assert.throws(
    () => createR2RecoveryArtifact(bucket(), "../other"),
    /identity/,
  );
  const b = bucket(),
    writer = createR2RecoveryArtifact(b, "count"),
    sig = signal();
  await writer.write(header(), sig);
  await writer.write(record(1, "commit"), sig);
  await assert.rejects(writer.write(record(2), sig), /bounds/);
  assert.throws(() => writer.descriptor(), /incomplete/);
});

test("incomplete storage is not readable and final receipt count cannot hide trailing events", async () => {
  const b = bucket(),
    writer = createR2RecoveryArtifact(b, "receipt"),
    sig = signal();
  await writer.write(header(), sig);
  await assert.rejects(collect(writer.source), /incomplete/);
  await writer.write(record(1), sig);
  await writer.write(record(2), sig);
  await writer.write(record(3, "commit"), sig);
  await assert.rejects(writer.complete(receipt(3), sig), /receipt/);
  assert.equal(b.objects.has(key("receipt", "index")), false);
});
test("unreferenced partial/unknown objects remain preserved outside the finite artifact", async () => {
  const { b, descriptor } = await sealed();
  b.replace(key("synthetic", "events/999999"), Uint8Array.of(7));
  assert.equal(
    (await collect(openR2RecoveryArtifact(b, descriptor))).length,
    4,
  );
  assert.ok(b.objects.has(key("synthetic", "events/999999")));
});

test("opaque header text preserves BOM and Unicode exactly rather than normalizing transport bytes", async () => {
  const writer = createR2RecoveryArtifact(bucket(), "utf8"),
    sig = signal();
  const event = { kind: "header", serialized: "\uFEFFopaque café 🌱" };
  await writer.write(event, sig);
  await writer.write(record(1), sig);
  await writer.write(record(2), sig);
  await writer.write(record(3, "commit"), sig);
  await writer.complete(receipt(), sig);
  assert.deepEqual((await collect(writer.source))[0], event);
});
