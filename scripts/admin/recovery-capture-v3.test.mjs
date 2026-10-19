import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RECOVERY_SCHEMA, RECOVERY_TABLES } from "./editorial-recovery.mjs";
import {
  RECOVERY_CAPTURE_V3_FORMAT,
  sealRecoveryCaptureV3,
  openRecoveryCaptureV3,
} from "./recovery-capture-v3.mjs";

const context = {
  captureId: "00000000-0000-0000-0000-000000000003",
  applicationRevision: "a".repeat(40),
  contentSchemaVersion: 1,
  editorialGeneration: 2,
  contentGeneration: 3,
};
function fixture(size = 70_001, largeControl = false) {
  const digest = createHash("sha256");
  for (let offset = 0; offset < size; offset += 65536)
    digest.update(Buffer.alloc(Math.min(65536, size - offset), 71));
  const id = `${digest.digest("hex")}.png`;
  const objects = [
    { plane: "private", id, type: "image/png", size },
    {
      plane: "public",
      id,
      type: "image/png",
      size,
      r2: {
        etag: "source-etag",
        version: "source-version",
        uploaded: "2026-10-19T00:00:00.000Z",
        httpMetadata: {
          contentType: "image/png",
          cacheControl: "public, max-age=3600",
        },
        customMetadata: { synthetic: "v3" },
      },
    },
  ];
  const tables = Object.fromEntries(
    Object.keys(RECOVERY_TABLES.editorial).map((name) => [name, []]),
  );
  if (largeControl)
    for (let revision = 1; revision <= 8; revision++) {
      const row = {
        key: "content/public/writing/synthetic.md",
        source: "x".repeat(510_000),
        baseCommit: context.applicationRevision,
        baseFileHash: null,
        revision,
        updatedAt: revision,
        discardedAt: null,
      };
      tables.revisions.push({
        key: row.key,
        revision,
        snapshot: JSON.stringify(row),
      });
    }
  const content = Object.fromEntries(
    Object.keys(RECOVERY_TABLES.content).map((name) => [name, []]),
  );
  content.editorial_published_inventory.push({ singleton: 1, version: 0 });
  const evidence = {
    captureId: context.captureId,
    editorialGeneration: 2,
    contentGeneration: 3,
    schemas: { editorial: [], content: [] },
    control: {
      editorial: [
        {
          singleton: 1,
          generation: 2,
          phase: "draining",
          capture_id: context.captureId,
        },
      ],
      content: [
        {
          singleton: 1,
          generation: 3,
          phase: "draining",
          capture_id: context.captureId,
        },
      ],
      editorialWriters: [],
      contentWriters: [],
      migrationLedger: [],
      captures: [],
    },
    objects: [{ key: id, ...objects[1].r2 }],
  };
  return {
    format: RECOVERY_CAPTURE_V3_FORMAT,
    snapshot: {
      schema: RECOVERY_SCHEMA,
      applicationRevision: context.applicationRevision,
      contentSchemaVersion: 1,
      editorial: {
        tables,
        kv: [
          {
            key: `media:${id}`,
            encoding: "json",
            value: { id, type: "image/png", size },
          },
        ],
        alarmAt: 1770000000000,
      },
      content: { tables: content },
    },
    objects,
    evidence,
  };
}
async function* media(object) {
  for (
    let offset = 0, index = 0;
    offset < object.size;
    offset += 65536, index++
  )
    yield {
      index,
      bytes: Buffer.alloc(Math.min(65536, object.size - offset), 71),
    };
}
const noop = () => ({ begin() {}, writeFrame() {}, complete() {}, abort() {} });
async function artifact(document = fixture()) {
  const events = [];
  const key = randomBytes(32);
  const receipt = await sealRecoveryCaptureV3(document, media, key, context, {
    write(event) {
      events.push(structuredClone(event));
    },
    complete() {},
    abort() {},
  });
  return { events, key, receipt, document };
}
test("v3 legal 10MiB in both planes and 4MiB-class controls round trip with one awaited frame and bounded file spool", async () => {
  const directory = await mkdtemp(join(tmpdir(), "anipotts-v3-synthetic-"));
  const document = fixture(10 * 1024 * 1024, true),
    key = randomBytes(32);
  let count = 0,
    outstanding = 0,
    maximum = 0,
    complete = false;
  try {
    const receipt = await sealRecoveryCaptureV3(document, media, key, context, {
      async write(event) {
        maximum = Math.max(maximum, ++outstanding);
        assert.equal(outstanding, 1);
        await writeFile(
          join(directory, String(count++)),
          JSON.stringify(event, (key, value) =>
            key === "ciphertext" || key === "tag"
              ? Buffer.from(value).toString("base64")
              : value,
          ),
        );
        outstanding--;
      },
      complete() {
        complete = true;
      },
      abort() {
        complete = false;
      },
    });
    assert(complete);
    assert(receipt.controlBytes > 4_000_000);
    assert.equal(receipt.mediaBytes, 20 * 1024 * 1024);
    assert.equal(maximum, 1);
    let opens = 0,
      visible = false,
      started = false,
      frames = 0;
    const digests = [createHash("sha256"), createHash("sha256")];
    const result = await openRecoveryCaptureV3(
      async function* () {
        opens++;
        for (let index = 0; index < count; index++) {
          const event = JSON.parse(
            await readFile(join(directory, String(index)), "utf8"),
          );
          if (event.kind === "record")
            for (const key of ["ciphertext", "tag"])
              event[key] = Buffer.from(event[key], "base64");
          yield event;
        }
      },
      key,
      context,
      {
        begin(value) {
          assert.equal(opens, 1);
          assert.deepEqual(value, document);
          started = true;
        },
        async writeFrame(frame) {
          assert(started);
          assert.equal(opens, 2);
          assert(!visible);
          maximum = Math.max(maximum, ++outstanding);
          assert.equal(outstanding, 1);
          digests[frame.objectIndex].update(frame.bytes);
          frames++;
          await Promise.resolve();
          outstanding--;
        },
        complete() {
          visible = true;
        },
        abort() {
          visible = false;
        },
      },
    );
    assert(visible);
    assert.equal(frames, 320);
    assert.equal(maximum, 1);
    assert.equal(opens, 2);
    assert.equal(result.receipt.transcript, receipt.transcript);
    for (const digest of digests)
      assert.equal(digest.digest("hex"), document.objects[0].id.split(".")[0]);
  } finally {
    key.fill(0);
    await rm(directory, { recursive: true, force: true });
  }
});
for (const scenario of [
  "wrong-key",
  "wrong-context",
  "tag",
  "header",
  "order",
  "duplicate",
  "truncated",
  "trailing",
  "changed-pass-two",
])
  test(`v3 rejects ${scenario} without successful restore`, async () => {
    const { events, key } = await artifact();
    let opens = 0,
      visible = false,
      begins = 0;
    const source = () => {
      opens++;
      const copy = structuredClone(events);
      if (scenario === "tag") copy[1].tag[0] ^= 1;
      if (scenario === "header") copy[0].serialized += " ";
      if (scenario === "order") [copy[1], copy[2]] = [copy[2], copy[1]];
      if (scenario === "duplicate") copy.splice(2, 0, copy[1]);
      if (scenario === "truncated") copy.pop();
      if (scenario === "trailing") copy.push(copy[0]);
      if (scenario === "changed-pass-two" && opens === 2)
        copy[1].ciphertext[0] ^= 1;
      return copy;
    };
    await assert.rejects(
      openRecoveryCaptureV3(
        source,
        scenario === "wrong-key" ? randomBytes(32) : key,
        scenario === "wrong-context"
          ? { ...context, editorialGeneration: 9 }
          : context,
        {
          ...noop(),
          begin() {
            begins++;
          },
          complete() {
            visible = true;
          },
        },
      ),
    );
    assert(!visible);
    assert.equal(begins, scenario === "changed-pass-two" ? 1 : 0);
  });
test("v3 rejects control limit and metadata inventory mismatch before artifact emission", async () => {
  for (const mutate of [
    (d) => {
      d.snapshot.editorial.tables.conflicts.push({
        id: "00000000-0000-0000-0000-000000000001",
        key: "content/public/writing/test.md",
        source: "a".repeat(4 * 1024 * 1024),
        expectedRevision: 0,
        createdAt: 0,
      });
    },
    (d) => {
      d.snapshot.editorial.kv[0].value.size++;
    },
    (d) => {
      d.evidence.objects[0].etag = "changed";
    },
  ]) {
    const document = fixture();
    mutate(document);
    let writes = 0;
    await assert.rejects(
      sealRecoveryCaptureV3(document, media, randomBytes(32), context, {
        write() {
          writes++;
        },
        complete() {},
        abort() {},
      }),
    );
    assert.equal(writes, 0);
  }
});
test("v3 cancellation of held final acknowledgment cannot report success", async () => {
  const { events, key } = await artifact();
  const controller = new AbortController();
  let signal, resolve;
  const held = new Promise((r) => (resolve = r));
  let complete = false;
  const pending = openRecoveryCaptureV3(
    () => events,
    key,
    context,
    {
      ...noop(),
      complete(value) {
        signal = value;
        complete = true;
        return held;
      },
    },
    { signal: controller.signal },
  );
  while (!complete) await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await assert.rejects(pending);
  assert(signal.aborted);
  resolve();
});

for (const variant of ["sparse-array", "hidden-field"])
  test(`v3 rejects noncanonical ${variant} without silently dropping control`, async () => {
    const document = fixture();
    if (variant === "sparse-array")
      document.evidence.schemas.editorial = Array(1);
    else
      Object.defineProperty(document.snapshot, "unknown", {
        value: "must not disappear",
        enumerable: false,
      });
    let writes = 0;
    await assert.rejects(
      sealRecoveryCaptureV3(document, media, randomBytes(32), context, {
        write() {
          writes++;
        },
        complete() {},
        abort() {},
      }),
    );
    assert.equal(writes, 0);
  });

function slowValue(value) {
  const until = performance.now() + 8;
  while (performance.now() < until) {
    /* deterministic synchronous preflight */
  }
  return value;
}
test("v3 charges synchronous control validation before any artifact write", async () => {
  const document = fixture();
  Object.defineProperty(document.snapshot, "applicationRevision", {
    enumerable: true,
    get: () => slowValue(context.applicationRevision),
  });
  let writes = 0;
  await assert.rejects(
    sealRecoveryCaptureV3(
      document,
      media,
      randomBytes(32),
      context,
      {
        write() {
          writes++;
        },
        complete() {},
        abort() {},
      },
      { timeoutMs: 2 },
    ),
    /deadline/u,
  );
  assert.equal(writes, 0);
});
test("v3 shared capture profile charges its own synchronous plan snapshot", async () => {
  const { createRecoveryFrameCodec } =
    await import("./recovery-media-encryption.mjs");
  const plan = {
    get objects() {
      return slowValue([]);
    },
    evidence: null,
  };
  let writes = 0;
  await assert.rejects(
    createRecoveryFrameCodec("capture-v3").seal(
      plan,
      media,
      randomBytes(32),
      context,
      {
        write() {
          writes++;
        },
        complete() {},
        abort() {},
      },
      { timeoutMs: 2 },
      "{}",
    ),
    /deadline/u,
  );
  assert.equal(writes, 0);
});
test("v3 final result work remains inside deadline and revokes staged sink admission", async () => {
  const { createRecoveryFrameCodec } =
    await import("./recovery-media-encryption.mjs");
  const { events, key } = await artifact();
  let signal,
    finalized = false;
  await assert.rejects(
    createRecoveryFrameCodec("capture-v3").open(
      () => events,
      key,
      context,
      {
        begin() {},
        writeFrame() {},
        writeManifest(_text, value) {
          signal = value;
        },
        abort() {},
      },
      { timeoutMs: 40 },
      (serialized) => ({
        objects: JSON.parse(serialized).objects,
        evidence: null,
      }),
      () => {
        finalized = true;
        const until = performance.now() + 50;
        while (performance.now() < until) {
          /* bounded final-result stall */
        }
        return {};
      },
    ),
    /deadline/u,
  );
  assert(finalized);
  assert(signal.aborted);
});

test("v3 awaits async final result under the operation deadline and ignores late acknowledgment", async () => {
  const { createRecoveryFrameCodec } =
    await import("./recovery-media-encryption.mjs");
  const { events, key } = await artifact();
  let signal,
    finalized = false,
    resolve,
    success = false;
  const held = new Promise((done) => (resolve = done));
  const pending = createRecoveryFrameCodec("capture-v3").open(
    () => events,
    key,
    context,
    {
      begin() {},
      writeFrame() {},
      writeManifest(_text, value) {
        signal = value;
      },
      abort() {},
    },
    { timeoutMs: 50 },
    (serialized) => ({
      objects: JSON.parse(serialized).objects,
      evidence: null,
    }),
    () => {
      finalized = true;
      return held;
    },
  );
  void pending.then(
    () => {
      success = true;
    },
    () => {},
  );
  await assert.rejects(pending, /deadline/u);
  assert(finalized);
  assert(signal.aborted);
  resolve({});
  await new Promise((done) => setTimeout(done, 0));
  assert(!success);
});
