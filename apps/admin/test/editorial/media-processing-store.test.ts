/// <reference types="@cloudflare/vitest-plugin/types" />
import { env } from "cloudflare:workers";
import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  commitPreparedCrop,
  mediaProcessingProvenanceKey,
  mediaProcessingRequestKey,
  type MediaCommitStorage,
} from "../../src/editorial/media-processing-store";
import {
  EditorialMediaStore,
  inspectEditorialMediaAdmission,
} from "../../src/editorial/media-store";
import {
  preparedCropFixture,
  jpegWithComments,
  storePng,
  storeJpeg,
  storeAlternatePng,
  faultAfterWrite,
} from "../fixtures/media-processing-store";

// Actual local SQLite-backed DO storage through the existing test namespace.
// The owner schedules this file. No Images binding or production RPC is added.
const request = (
  originalBytes = new Uint8Array(storeJpeg),
  output = new Uint8Array(storePng),
) => ({
  requestId: crypto.randomUUID(),
  originalBytes,
  candidate: preparedCropFixture(originalBytes, output),
});
async function failure(
  storage: MediaCommitStorage,
  input: Parameters<typeof commitPreparedCrop>[1],
) {
  try {
    await commitPreparedCrop(storage, input);
    return "unexpected_success";
  } catch (error) {
    return error instanceof Error ? error.message : "unknown_failure";
  }
}

describe("atomic private-media primitive in real local workerd/SQLite", () => {
  it("preserves existing save/read behavior and metadata layout after pure admission extraction", async () => {
    const object = env.EDITORIAL.getByName(crypto.randomUUID());
    await runInDurableObject(object, async (_instance, state) => {
      const store = new EditorialMediaStore(state.storage);
      const bytes = jpegWithComments();
      const admitted = inspectEditorialMediaAdmission(bytes);
      if (!admitted.ok) throw new Error("fixture admission");
      const saved = await store.save(bytes);
      expect(saved).toEqual({ ok: true, media: admitted.media });
      expect((await store.read(admitted.media.id))?.bytes).toEqual(bytes);
      expect(await state.storage.get(`media:${admitted.media.id}`)).toEqual(
        admitted.media,
      );
      expect(
        (await state.storage.list({ prefix: "media-processing-" })).size,
      ).toBe(0);
    });
  });
  it("commits and reads exact media, provenance and receipt across object eviction", async () => {
    const object = env.EDITORIAL.getByName(crypto.randomUUID());
    const input = request(jpegWithComments());
    const receipt = await runInDurableObject(
      object,
      async (_instance, state) => {
        const receipt = await commitPreparedCrop(state.storage, input);
        const store = new EditorialMediaStore(state.storage);
        expect((await store.read(receipt.parentId))?.bytes).toEqual(
          input.originalBytes,
        );
        expect((await store.read(receipt.derivativeId))?.bytes).toEqual(
          input.candidate.bytes,
        );
        expect(
          await state.storage.get(
            mediaProcessingProvenanceKey(input.candidate.provenance),
          ),
        ).toEqual(input.candidate.provenance);
        expect(
          await state.storage.get(mediaProcessingRequestKey(input.requestId)),
        ).toEqual(receipt);
        return receipt;
      },
    );
    await evictDurableObject(object);
    expect(
      await runInDurableObject(object, (_instance, state) =>
        commitPreparedCrop(state.storage, input),
      ),
    ).toEqual(receipt);
  });
  it.each([
    "original_chunk",
    "original_metadata",
    "derivative",
    "provenance",
    "receipt",
  ] as const)(
    "rolls back real transaction writes after %s failure and preserves unrelated state",
    async (stage) => {
      const object = env.EDITORIAL.getByName(crypto.randomUUID()),
        input = request(jpegWithComments());
      await runInDurableObject(object, async (_instance, state) => {
        await state.storage.put("synthetic-unrelated", { keep: true });
        const points = {
          original_chunk: `media:${input.candidate.decode.original.id}:0`,
          original_metadata: `media:${input.candidate.decode.original.id}`,
          derivative: `media:${input.candidate.media.id}`,
          provenance: mediaProcessingProvenanceKey(input.candidate.provenance),
          receipt: mediaProcessingRequestKey(input.requestId),
        };
        const before = await state.storage.list();
        // Catch inside the native callback, so expected errors do not escape RPC.
        expect(
          await failure(faultAfterWrite(state.storage, points[stage]), input),
        ).toBe("synthetic_write_failure");
        expect(await state.storage.list()).toEqual(before);
      });
    },
  );
  it("serializes concurrent identical and conflicting requests without partial edges", async () => {
    const object = env.EDITORIAL.getByName(crypto.randomUUID()),
      input = request();
    const changed = request(input.originalBytes, storeAlternatePng);
    changed.requestId = input.requestId;
    const results = await Promise.all([
      runInDurableObject(object, async (_instance, state) => {
        try {
          return { receipt: await commitPreparedCrop(state.storage, input) };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "unknown_failure",
          };
        }
      }),
      runInDurableObject(object, async (_instance, state) => {
        try {
          return { receipt: await commitPreparedCrop(state.storage, changed) };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "unknown_failure",
          };
        }
      }),
    ]);
    expect(results.filter((result) => result.receipt)).toHaveLength(1);
    expect(
      results.filter((result) => result.error === "request_conflict"),
    ).toHaveLength(1);
    await runInDurableObject(object, async (_instance, state) => {
      const winner = results.find((result) => result.receipt)!.receipt!;
      const selected =
        winner.derivativeId === input.candidate.media.id ? input : changed;
      const replay = await Promise.all([
        commitPreparedCrop(state.storage, selected),
        commitPreparedCrop(state.storage, selected),
      ]);
      expect(replay).toEqual([winner, winner]);
      expect(
        (await state.storage.list({ prefix: "media-processing-provenance:" }))
          .size,
      ).toBe(1);
    });
  });
  it("replays actual committed state after a lost acknowledgement without rewriting values", async () => {
    const object = env.EDITORIAL.getByName(crypto.randomUUID()),
      input = request();
    await runInDurableObject(object, async (_instance, state) => {
      const uncertain: MediaCommitStorage = {
        async transaction(callback) {
          await state.storage.transaction(callback);
          throw new Error("synthetic_ack_lost");
        },
      };
      expect(await failure(uncertain, input)).toBe("synthetic_ack_lost");
      const before = await state.storage.list();
      const receipt = await commitPreparedCrop(state.storage, input);
      expect(receipt).toEqual(
        before.get(mediaProcessingRequestKey(input.requestId)),
      );
      expect(await state.storage.list()).toEqual(before);
    });
  });
  it("retains both shared-derivative edges and permits original/derivative self identity", async () => {
    const object = env.EDITORIAL.getByName(crypto.randomUUID());
    await runInDurableObject(object, async (_instance, state) => {
      const left = request(),
        right = request(jpegWithComments(1)),
        self = request(new Uint8Array(storePng));
      const a = await commitPreparedCrop(state.storage, left),
        b = await commitPreparedCrop(state.storage, right);
      expect(a.derivativeId).toBe(b.derivativeId);
      expect(a.provenanceId).not.toBe(b.provenanceId);
      const c = await commitPreparedCrop(state.storage, self);
      expect(c.parentId).toBe(c.derivativeId);
      expect(
        (await state.storage.list({ prefix: "media-processing-provenance:" }))
          .size,
      ).toBe(3);
    });
  });
  it("snapshots inputs before an actual transaction read while caller values are mutated", async () => {
    const object = env.EDITORIAL.getByName(crypto.randomUUID()),
      input = request(jpegWithComments());
    await runInDurableObject(object, async (_instance, state) => {
      const expected = structuredClone(input);
      let first = true;
      const mutate: MediaCommitStorage = {
        transaction(callback) {
          return state.storage.transaction((transaction) =>
            callback({
              list: transaction.list.bind(transaction),
              put: transaction.put.bind(transaction),
              async get<T>(key: string) {
                const result = await transaction.get<T>(key);
                if (first) {
                  first = false;
                  input.originalBytes.fill(0);
                  input.candidate.bytes.fill(0);
                  input.candidate.provenance.plan.output.width = 100;
                  input.requestId = crypto.randomUUID();
                }
                return result;
              },
            }),
          );
        },
      };
      const receipt = await commitPreparedCrop(mutate, input);
      expect(receipt.requestId).toBe(expected.requestId);
      const store = new EditorialMediaStore(state.storage);
      expect((await store.read(receipt.parentId))?.bytes).toEqual(
        expected.originalBytes,
      );
      expect((await store.read(receipt.derivativeId))?.bytes).toEqual(
        expected.candidate.bytes,
      );
      expect(
        await state.storage.get(
          mediaProcessingProvenanceKey(expected.candidate.provenance),
        ),
      ).toEqual(expected.candidate.provenance);
    });
  });
  it("rejects corrupt originals and previously stored corruption without repairing either", async () => {
    const object = env.EDITORIAL.getByName(crypto.randomUUID()),
      input = request();
    await runInDurableObject(object, async (_instance, state) => {
      expect(
        await failure(state.storage, {
          ...input,
          originalBytes: new Uint8Array([255, 216, 255, 217]),
        }),
      ).toBe("invalid_candidate");
      expect((await state.storage.list()).size).toBe(0);
      const receipt = await commitPreparedCrop(state.storage, input);
      await state.storage.put(
        `media:${receipt.parentId}:0`,
        new Uint8Array([0]),
      );
      const before = await state.storage.list();
      expect(await failure(state.storage, input)).toBe("stored_media_corrupt");
      expect(await state.storage.list()).toEqual(before);
    });
  });
});
