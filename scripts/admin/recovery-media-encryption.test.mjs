import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  sealEncryptedRecoveryMedia as seal,
  openEncryptedRecoveryMedia as open,
  ENCRYPTED_RECOVERY_MEDIA_LIMITS as encryptedLimits,
} from "./recovery-media-encryption.mjs";
import { RECOVERY_MEDIA_CONTAINER_LIMITS as limits } from "./recovery-media-container.mjs";

const context = () => ({
  captureId: "12345678-1234-1234-1234-123456789abc",
  applicationRevision: "a".repeat(40),
  contentSchemaVersion: 1,
  editorialGeneration: 3,
  contentGeneration: 4,
});
const block = (index, length) => new Uint8Array(length).fill(index % 251);
function object(size, plane = "private") {
  const hash = createHash("sha256");
  for (
    let offset = 0, index = 0;
    offset < size;
    offset += limits.frameBytes, index++
  )
    hash.update(block(index, Math.min(limits.frameBytes, size - offset)));
  return {
    plane,
    size,
    type: "image/png",
    id: `${hash.digest("hex")}.png`,
    ...(plane === "public"
      ? {
          r2: {
            etag: "synthetic-etag",
            version: "synthetic-version",
            uploaded: "2026-10-19T00:00:00.000Z",
            httpMetadata: {
              contentType: "image/png",
              cacheControl: "public, immutable",
            },
            customMetadata: { fixture: "synthetic", exact: "café\r\n雨" },
          },
        }
      : {}),
  };
}
async function* read(object) {
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
const plan = (objects = [object(limits.frameBytes + 7)]) => ({
  objects,
  evidence: { fixture: "synthetic codec only" },
});
function encryptedSink() {
  return {
    events: [],
    completed: 0,
    aborted: 0,
    write(event) {
      this.events.push(structuredClone(event));
    },
    complete() {
      this.completed++;
    },
    abort() {
      this.aborted++;
    },
  };
}
function plainSink() {
  return {
    frames: [],
    manifests: [],
    aborted: 0,
    writeFrame(frame) {
      this.frames.push(structuredClone(frame));
    },
    writeManifest(serialized) {
      this.manifests.push(serialized);
    },
    abort() {
      this.aborted++;
    },
  };
}
async function fixture(input = plan()) {
  const key = randomBytes(32),
    identity = context(),
    sink = encryptedSink();
  const receipt = await seal(input, read, key, identity, sink);
  return { key, identity, sink, receipt, input };
}
async function rejected(events, key, identity, options) {
  const sink = plainSink();
  await assert.rejects(
    open(() => events, key, identity, sink, options),
    /^Error: encrypted_recovery_media_/u,
  );
  assert.equal(sink.manifests.length, 0);
  assert.equal(sink.aborted, 1);
  return sink;
}
function gate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("synthetic 10 MiB in each plane round-trips from bounded on-disk ciphertext frames", async () => {
  const directory = await mkdtemp(join(tmpdir(), "recovery-codec-synthetic-"));
  const input = plan([
    object(limits.objectBytes),
    object(limits.objectBytes, "public"),
  ]);
  const key = randomBytes(32),
    identity = context();
  let records = 0,
    completed = 0,
    outstanding = 0,
    maximum = 0;
  try {
    const receipt = await seal(input, read, key, identity, {
      async write(event, signal) {
        outstanding++;
        maximum = Math.max(maximum, outstanding);
        assert.equal(signal.aborted, false);
        if (event.kind === "header")
          await writeFile(join(directory, "header"), event.serialized);
        else {
          const { ciphertext, tag, ...metadata } = event;
          const text = Buffer.from(JSON.stringify(metadata));
          const length = Buffer.alloc(4);
          length.writeUInt32BE(text.length);
          assert.ok(ciphertext.byteLength <= limits.frameBytes);
          // Only one frame is assembled; no entire object or 20 MiB list.
          await writeFile(
            join(directory, String(records++)),
            Buffer.concat([length, text, ciphertext, tag]),
          );
        }
        outstanding--;
      },
      complete(_receipt, signal) {
        assert.equal(signal.aborted, false);
        completed++;
      },
      abort() {
        assert.fail("valid synthetic transport aborted");
      },
    });
    assert.equal(receipt.mediaBytes, 20 * 1024 * 1024);
    assert.equal(receipt.mediaFrames, 320);
    assert.equal(maximum, 1);
    assert.equal(completed, 1);
    let passes = 0,
      frames = 0,
      final = 0;
    const hashes = input.objects.map(() => createHash("sha256"));
    const result = await open(
      async function* () {
        passes++;
        yield {
          kind: "header",
          serialized: await readFile(join(directory, "header"), "utf8"),
        };
        for (let index = 0; index < records; index++) {
          const bytes = await readFile(join(directory, String(index)));
          const end = 4 + bytes.readUInt32BE(0);
          const metadata = JSON.parse(bytes.subarray(4, end).toString());
          yield {
            ...metadata,
            ciphertext: bytes.subarray(end, bytes.length - 16),
            tag: bytes.subarray(bytes.length - 16),
          };
        }
      },
      key,
      identity,
      {
        async writeFrame(frame, signal) {
          outstanding++;
          maximum = Math.max(maximum, outstanding);
          assert.equal(signal.aborted, false);
          assert.equal(frame.objectIndex, Math.floor(frames / 160));
          assert.equal(frame.index, frames % 160);
          hashes[frame.objectIndex].update(frame.bytes);
          frames++;
          await Promise.resolve();
          outstanding--;
        },
        writeManifest(_serialized, signal) {
          assert.equal(signal.aborted, false);
          assert.equal(frames, 320);
          final++;
        },
        abort() {
          assert.fail("valid synthetic restore aborted");
        },
      },
    );
    assert.equal(passes, 2);
    assert.equal(final, 1);
    assert.equal(maximum, 1);
    assert.deepEqual(result.objects, input.objects);
    assert.deepEqual(result.evidence, input.evidence);
    assert.deepEqual(
      hashes.map((hash) => `${hash.digest("hex")}.png`),
      input.objects.map((entry) => entry.id),
    );
  } finally {
    key.fill(0);
    await rm(directory, { recursive: true, force: true });
  }
});

test("fresh ephemeral keys and counters; source/key/context snapshots survive delayed acknowledgment", async () => {
  const key = randomBytes(32),
    originalKey = Buffer.from(key),
    identity = context(),
    originalContext = context();
  const input = plan(),
    expected = structuredClone(input),
    output = encryptedSink();
  const entered = gate(),
    held = gate();
  let produced = 0;
  output.write = async (event) => {
    output.events.push(structuredClone(event));
    if (
      event.kind === "record" &&
      event.role === "media" &&
      event.index === 0
    ) {
      entered.release();
      await held.promise;
    }
  };
  const transfer = seal(
    input,
    async function* (entry) {
      for await (const frame of read(entry)) {
        produced++;
        yield frame;
        frame.bytes.fill(255);
      }
    },
    key,
    identity,
    output,
  );
  key.fill(255);
  identity.captureId = "00000000-0000-0000-0000-000000000000";
  input.evidence.fixture = "changed";
  await entered.promise;
  assert.equal(produced, 1);
  assert.equal(output.completed, 0);
  held.release();
  await transfer;
  const restored = plainSink();
  const manifest = await open(
    () => output.events,
    originalKey,
    originalContext,
    restored,
  );
  assert.deepEqual(manifest.evidence, expected.evidence);
  assert.equal(restored.frames[0].bytes[0], 0);
  assert.deepEqual(
    output.events.slice(1).map((record) => record.sequence),
    output.events.slice(1).map((_, i) => i + 1),
  );
  const other = encryptedSink();
  await seal(expected, read, originalKey, originalContext, other);
  assert.notEqual(output.events[0].serialized, other.events[0].serialized);
});

for (const damage of [
  "wrong-key",
  "wrong-context",
  "header",
  "wrap-tag",
  "ciphertext",
  "tag",
  "role",
  "length",
  "object-index",
  "index",
  "sequence",
  "swap",
  "duplicate",
  "missing",
  "truncated",
  "trailing",
  "missing-commit",
]) {
  test(`${damage} fails without a successful staging manifest`, async () => {
    const { key, identity, sink } = await fixture();
    const events = structuredClone(sink.events);
    if (damage === "wrong-key") key[0] ^= 1;
    else if (damage === "wrong-context") identity.contentGeneration++;
    else if (damage === "header") events[0].serialized += " ";
    else if (damage === "wrap-tag") {
      const header = JSON.parse(events[0].serialized);
      header.wrap.tag = `${header.wrap.tag[0] === "a" ? "b" : "a"}${header.wrap.tag.slice(1)}`;
      events[0].serialized = JSON.stringify(header); // parsed canonical header order is retained
    } else if (damage === "ciphertext") events[1].ciphertext[0] ^= 1;
    else if (damage === "tag") events[1].tag[0] ^= 1;
    else if (damage === "role") events[1].role = "manifest";
    else if (damage === "length") events[1].length--;
    else if (damage === "object-index") events[1].objectIndex++;
    else if (damage === "index") events[1].index++;
    else if (damage === "sequence") events[1].sequence++;
    else if (damage === "swap") [events[1], events[2]] = [events[2], events[1]];
    else if (damage === "duplicate")
      events.splice(2, 0, structuredClone(events[1]));
    else if (damage === "missing") events.splice(1, 1);
    else if (damage === "truncated") events.splice(2);
    else if (damage === "trailing") events.push(structuredClone(events.at(-1)));
    else events.pop();
    const output = await rejected(events, key, identity);
    assert.equal(
      output.frames.length,
      0,
      "first pass must fully authenticate before staging plaintext",
    );
  });
}

test("valid but changed second-pass ciphertext cannot finalize", async () => {
  const first = await fixture();
  const second = encryptedSink();
  await seal(first.input, read, first.key, first.identity, second);
  let calls = 0;
  const output = plainSink();
  await assert.rejects(
    open(
      () => (++calls === 1 ? first.sink.events : second.events),
      first.key,
      first.identity,
      output,
    ),
    /changed_source/u,
  );
  assert.equal(calls, 2);
  assert.equal(output.frames.length, 0);
  assert.equal(output.manifests.length, 0);
});

test("second-pass truncation after plaintext staging aborts without final manifest", async () => {
  const fixtureData = await fixture();
  let passes = 0;
  const output = plainSink();
  await assert.rejects(
    open(
      () =>
        ++passes === 1
          ? fixtureData.sink.events
          : fixtureData.sink.events.slice(0, -1),
      fixtureData.key,
      fixtureData.identity,
      output,
    ),
    /truncated/u,
  );
  assert.equal(output.frames.length, 2);
  assert.equal(output.manifests.length, 0);
  assert.equal(output.aborted, 1);
});

for (const mode of ["abort", "deadline"]) {
  test(`${mode} during a held encryption sink prevents late writes/finalization`, async () => {
    const key = randomBytes(32),
      controller = new AbortController(),
      held = gate(),
      entered = gate();
    const output = encryptedSink();
    output.write = async (event, signal) => {
      output.events.push(structuredClone(event));
      entered.release();
      await held.promise;
      assert.equal(signal.aborted, true);
    };
    const pending = seal(
      plan(),
      read,
      key,
      context(),
      output,
      mode === "abort" ? { signal: controller.signal } : { timeoutMs: 15 },
    );
    const rejection = assert.rejects(
      pending,
      new RegExp(mode === "abort" ? "aborted" : "deadline", "u"),
    );
    await entered.promise;
    if (mode === "abort") controller.abort();
    await rejection;
    assert.equal(output.aborted, 1);
    assert.equal(output.completed, 0);
    assert.equal(output.events.length, 1);
    held.release();
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(output.events.length, 1);
    assert.equal(output.completed, 0);
  });
}

test("revocation during second-pass stage holds keeps finalization stopped", async () => {
  const fixtureData = await fixture(),
    controller = new AbortController(),
    held = gate(),
    entered = gate();
  const output = plainSink();
  output.writeFrame = async (frame, signal) => {
    output.frames.push(structuredClone(frame));
    entered.release();
    await held.promise;
    assert.equal(signal.aborted, true);
  };
  const pending = open(
    () => fixtureData.sink.events,
    fixtureData.key,
    fixtureData.identity,
    output,
    { signal: controller.signal },
  );
  const rejection = assert.rejects(pending, /aborted/u);
  await entered.promise;
  controller.abort();
  await rejection;
  assert.equal(output.aborted, 1);
  assert.equal(output.manifests.length, 0);
  held.release();
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(output.frames.length, 1);
  assert.equal(output.manifests.length, 0);
});

test("hung reader deadline settles and late completion cannot resume reads", async () => {
  const fixtureData = await fixture(),
    held = gate(),
    output = plainSink();
  let reads = 0;
  const source = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next() {
      reads++;
      return held.promise;
    },
  };
  await assert.rejects(
    open(() => source, fixtureData.key, fixtureData.identity, output, {
      timeoutMs: 10,
    }),
    /deadline/u,
  );
  assert.equal(reads, 1);
  assert.equal(output.manifests.length, 0);
  assert.equal(output.aborted, 1);
  held.release({ done: false, value: fixtureData.sink.events[0] });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(reads, 1);
});

test("key, context, event, aggregate and strict metadata bounds reject before success", async () => {
  const key = randomBytes(32),
    identity = context();
  const output = encryptedSink();
  await assert.rejects(
    seal(plan(), read, new Uint8Array(33), identity, output),
    /binary/u,
  );
  await assert.rejects(
    seal(plan(), read, key, { ...identity, extra: true }, output),
    /schema/u,
  );
  await assert.rejects(
    seal(plan([object(limits.objectBytes + 1)]), read, key, identity, output),
    /transfer/u,
  );
  const fixtureData = await fixture();
  await rejected(
    [
      {
        kind: "header",
        serialized: "x".repeat(encryptedLimits.headerBytes + 1),
      },
    ],
    fixtureData.key,
    fixtureData.identity,
  );
  const extra = structuredClone(fixtureData.sink.events);
  extra[1].extra = true;
  await rejected(extra, fixtureData.key, fixtureData.identity);
  const giant = structuredClone(fixtureData.sink.events);
  giant[1].ciphertext = new Uint8Array(limits.frameBytes + 1);
  await rejected(giant, fixtureData.key, fixtureData.identity);
});

test("same-header second-pass damage after one verified frame still cannot finalize", async () => {
  const data = await fixture(),
    changed = structuredClone(data.sink.events);
  changed[2].ciphertext[0] ^= 1;
  let passes = 0;
  const output = plainSink();
  await assert.rejects(
    open(
      () => (++passes === 1 ? data.sink.events : changed),
      data.key,
      data.identity,
      output,
    ),
    /authentication/u,
  );
  assert.equal(output.frames.length, 1);
  assert.equal(output.manifests.length, 0);
  assert.equal(output.aborted, 1);
});

test("opening snapshots key/context before its first supplied read await", async () => {
  const data = await fixture(),
    key = Buffer.from(data.key),
    identity = structuredClone(data.identity),
    held = gate(),
    entered = gate();
  let passes = 0;
  const output = plainSink();
  const pending = open(
    async function* () {
      if (++passes === 1) {
        entered.release();
        await held.promise;
      }
      yield* data.sink.events;
    },
    key,
    identity,
    output,
  );
  await entered.promise;
  key.fill(255);
  identity.contentGeneration++;
  held.release();
  await pending;
  assert.equal(output.frames.length, 2);
  assert.equal(output.manifests.length, 1);
});

test("absolute deadline rejects a synchronous slow source before invoking an output write", async () => {
  const output = encryptedSink();
  await assert.rejects(
    seal(
      plan(),
      function* () {
        const until = performance.now() + 12;
        while (performance.now() < until) {
          /* Synthetic blocked caller event turn. */
        }
        yield { index: 0, bytes: block(0, limits.frameBytes) };
      },
      randomBytes(32),
      context(),
      output,
      { timeoutMs: 5 },
    ),
    /deadline/u,
  );
  assert.equal(output.events.length, 0);
  assert.equal(output.completed, 0);
  assert.equal(output.aborted, 1);
});

test("ready large sources yield an event turn for explicit revocation", async () => {
  const output = encryptedSink(),
    controller = new AbortController();
  const pending = seal(
    plan([object(limits.objectBytes)]),
    read,
    randomBytes(32),
    context(),
    output,
    { signal: controller.signal },
  );
  const rejection = assert.rejects(pending, /aborted/u);
  setTimeout(() => controller.abort(), 0);
  await rejection;
  assert.ok(output.events.length < 160);
  assert.equal(output.completed, 0);
  assert.equal(output.aborted, 1);
});

test("intrinsic copies ignore hostile public typed-array length/iterator accessors", async () => {
  const data = await fixture();
  const hostile = (bytes) => {
    const value = new Uint8Array(bytes);
    for (const name of [
      "length",
      "byteLength",
      "buffer",
      "byteOffset",
      Symbol.iterator,
    ])
      Object.defineProperty(value, name, {
        get() {
          throw new Error("synthetic_public_accessor_used");
        },
      });
    return value;
  };
  const key = hostile(data.key),
    encrypted = encryptedSink();
  await seal(data.input, read, key, data.identity, encrypted);
  const events = encrypted.events.map((event) =>
    event.kind === "header"
      ? event
      : {
          ...event,
          ciphertext: hostile(event.ciphertext),
          tag: hostile(event.tag),
        },
  );
  const output = plainSink();
  await open(() => events, key, data.identity, output);
  assert.equal(output.frames.length, 2);
  assert.equal(output.manifests.length, 1);
  const oversized = new Uint8Array(33);
  Object.defineProperty(oversized, "length", { value: 32 });
  await assert.rejects(
    seal(data.input, read, oversized, data.identity, encryptedSink()),
    /binary/u,
  );
});

for (const direction of ["seal", "open"]) {
  test(`${direction} cancellation while final acknowledgment is held cannot report success`, async () => {
    const data = await fixture(),
      controller = new AbortController();
    const entered = gate(),
      held = gate(),
      acknowledged = gate();
    let operationSignal,
      finalCalls = 0,
      cooperativeVisibility = 0,
      returnedSuccess = false;
    const final = async (signal) => {
      operationSignal = signal;
      finalCalls++;
      entered.release();
      await held.promise;
      // This is a cooperative supplied sink, not a claim that arbitrary caller
      // effects can be rolled back after the final callback has been invoked.
      if (!signal.aborted) cooperativeVisibility++;
      acknowledged.release();
    };
    const sink =
      direction === "seal"
        ? {
            ...encryptedSink(),
            complete(_receipt, signal) {
              return final(signal);
            },
          }
        : {
            ...plainSink(),
            writeManifest(_serialized, signal) {
              return final(signal);
            },
          };
    const pending =
      direction === "seal"
        ? seal(data.input, read, data.key, data.identity, sink, {
            signal: controller.signal,
          })
        : open(() => data.sink.events, data.key, data.identity, sink, {
            signal: controller.signal,
          });
    void pending.then(
      () => {
        returnedSuccess = true;
      },
      () => {},
    );
    const rejection = assert.rejects(pending, /aborted/u);
    await entered.promise;
    assert.equal(operationSignal.aborted, false);
    assert.equal(finalCalls, 1);
    assert.equal(returnedSuccess, false);
    controller.abort();
    await rejection;
    assert.equal(operationSignal.aborted, true);
    assert.equal(sink.aborted, 1);
    held.release();
    await acknowledged.promise;
    assert.equal(finalCalls, 1);
    assert.equal(cooperativeVisibility, 0);
    assert.equal(returnedSuccess, false);
  });
}
