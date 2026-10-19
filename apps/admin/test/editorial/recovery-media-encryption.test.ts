/// <reference types="@cloudflare/vitest-plugin/types" />
import { createHash, randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import {
  sealEncryptedRecoveryMedia as seal,
  openEncryptedRecoveryMedia as open,
  type EncryptedRecoveryMediaEvent,
  type RecoveryMediaEncryptionContext,
} from "../../../../scripts/admin/recovery-media-encryption.mjs";
import type { RecoveryMediaPlan } from "../../../../scripts/admin/recovery-media-container.mjs";

const context: RecoveryMediaEncryptionContext = {
  captureId: "12345678-1234-1234-1234-123456789abc",
  applicationRevision: "a".repeat(40),
  contentSchemaVersion: 1,
  editorialGeneration: 3,
  contentGeneration: 4,
};
async function fixture() {
  // Bounded native AES-GCM qualification; the Node file-backed test separately
  // covers the maximum 10 MiB object in both planes without retaining 20 MiB.
  const bytes = new Uint8Array(64 * 1024).fill(7);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const plan: RecoveryMediaPlan = {
    objects: [
      {
        plane: "private",
        id: `${hash}.png`,
        type: "image/png",
        size: bytes.length,
      },
      {
        plane: "public",
        id: `${hash}.png`,
        type: "image/png",
        size: bytes.length,
        r2: {
          etag: "synthetic-etag",
          version: "synthetic-version",
          uploaded: "2026-10-19T00:00:00.000Z",
          httpMetadata: { contentType: "image/png" },
          customMetadata: { fixture: "synthetic" },
        },
      },
    ],
    evidence: { qualification: "supplied encrypted codec only" },
  };
  const key = randomBytes(32),
    events: EncryptedRecoveryMediaEvent[] = [];
  await seal(
    plan,
    async function* () {
      yield { index: 0, bytes };
    },
    key,
    context,
    {
      write(event) {
        events.push(structuredClone(event));
      },
      complete() {},
      abort() {
        throw new Error("synthetic_unexpected_abort");
      },
    },
  );
  return { bytes, hash, plan, key, events };
}

it("workerd native AES-GCM unwraps two-pass ciphertext and awaits one plaintext frame", async () => {
  const data = await fixture();
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let passes = 0,
    writes = 0,
    finalized = 0;
  const hashes = [createHash("sha256"), createHash("sha256")];
  const result = open(
    () => {
      passes++;
      return data.events;
    },
    data.key,
    context,
    {
      async writeFrame(frame, signal) {
        expect(signal.aborted).toBe(false);
        if (!writes) {
          entered();
          await gate;
        }
        expect(frame.objectIndex).toBe(writes);
        hashes[frame.objectIndex]!.update(frame.bytes);
        writes++;
      },
      writeManifest(_serialized, signal) {
        expect(signal.aborted).toBe(false);
        expect(writes).toBe(2);
        finalized++;
      },
      abort() {
        throw new Error("synthetic_unexpected_abort");
      },
    },
  );
  await started;
  expect(passes).toBe(2);
  expect(writes).toBe(0);
  expect(finalized).toBe(0);
  release();
  const manifest = await result;
  expect(manifest.objects).toEqual(data.plan.objects);
  expect(manifest.evidence).toEqual(data.plan.evidence);
  expect(hashes.map((hash) => hash.digest("hex"))).toEqual([
    data.hash,
    data.hash,
  ]);
  expect(finalized).toBe(1);
  data.key.fill(0);
});

it("workerd rejects native GCM tag damage and second-pass truncation without final manifest", async () => {
  const data = await fixture();
  for (const mode of ["tag", "truncated"] as const) {
    const changed = structuredClone(data.events);
    const first = changed[1];
    if (!first || first.kind !== "record")
      throw new Error("synthetic_fixture_record");
    if (mode === "tag") first.tag[0] = first.tag[0]! ^ 1;
    else changed.pop();
    let passes = 0,
      writes = 0,
      final = 0,
      aborted = 0;
    await expect(
      open(
        () => (++passes === 1 && mode === "truncated" ? data.events : changed),
        data.key,
        context,
        {
          writeFrame() {
            writes++;
          },
          writeManifest() {
            final++;
          },
          abort() {
            aborted++;
          },
        },
      ),
    ).rejects.toThrow(
      `encrypted_recovery_media_${mode === "tag" ? "authentication" : "truncated"}`,
    );
    expect(writes).toBe(mode === "tag" ? 0 : 2);
    expect(final).toBe(0);
    expect(aborted).toBe(1);
  }
  data.key.fill(0);
});

it("workerd revocation during native staged plaintext prevents late finalization", async () => {
  const data = await fixture(),
    controller = new AbortController();
  let release!: () => void, entered!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let writes = 0,
    final = 0,
    aborted = 0;
  const result = open(
    () => data.events,
    data.key,
    context,
    {
      async writeFrame(_frame, signal) {
        writes++;
        entered();
        await held;
        expect(signal.aborted).toBe(true);
      },
      writeManifest() {
        final++;
      },
      abort() {
        aborted++;
      },
    },
    { signal: controller.signal },
  );
  const rejection = expect(result).rejects.toThrow(
    "encrypted_recovery_media_aborted",
  );
  await started;
  controller.abort();
  await rejection;
  release();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(writes).toBe(1);
  expect(final).toBe(0);
  expect(aborted).toBe(1);
  data.key.fill(0);
});
