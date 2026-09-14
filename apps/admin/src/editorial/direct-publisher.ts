import { createHash } from "node:crypto";
import {
  getDirectReceipt,
  publishDirect,
} from "@anipotts/content/editorial/direct-publication";
import {
  editorialRecordSchema,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import type { EditorialDraftStore } from "./draft-store";
import {
  MAX_PUBLICATION_IMAGES,
  MAX_PUBLICATION_MEDIA_BYTES,
  referencedMediaIds,
} from "../lib/editorial-media";

export type DirectPublishInput = {
  record: EditorialRecord;
  expectedRevision: number;
  operationId: string;
  expectedPublicationId: string | null;
  reviewedSourceSha256: string;
};
export type DirectPublisherDependencies = {
  store: Pick<EditorialDraftStore, "captureDirectDraft" | "readMedia">;
  db: Parameters<typeof publishDirect>[0];
  media: Pick<R2Bucket, "put" | "get">;
  /** Validate the complete published inventory with this exact source overlaid. */
  validateSnapshot(
    record: EditorialRecord,
    source: string,
  ): Promise<{ valid: boolean; inventoryVersion: number }>;
  now?: () => Date;
};
const hash = (bytes: string | Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");

/** Publish only a reviewed frozen source. Never arms the legacy Git alarm. */
export async function directPublishDraft(
  deps: DirectPublisherDependencies,
  input: DirectPublishInput,
) {
  if (
    !editorialRecordSchema.safeParse(input.record).success ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 1 ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(input.operationId) ||
    (input.expectedPublicationId !== null &&
      !/^[A-Za-z0-9_-]{1,128}$/.test(input.expectedPublicationId)) ||
    !/^[a-f0-9]{64}$/.test(input.reviewedSourceSha256)
  )
    return { status: "invalid_request" } as const;
  const receipt = await getDirectReceipt(deps.db, input.operationId);
  if (receipt) {
    if (
      receipt.record.kind !== input.record.kind ||
      receipt.record.id !== input.record.id ||
      receipt.revision !== input.expectedRevision ||
      receipt.sourceSha256 !== input.reviewedSourceSha256 ||
      receipt.expectedPublicationId !== input.expectedPublicationId
    )
      return { status: "idempotency_conflict" } as const;
    const {
      expectedPublicationId: _pointer,
      expectedInventoryVersion: _version,
      ...publication
    } = receipt;
    return { status: "replayed", publication } as const;
  }
  const captured = await deps.store.captureDirectDraft(input);
  if (!captured.ok) return { status: captured.code } as const;
  const source = captured.draft.source;
  if (hash(source) !== input.reviewedSourceSha256)
    return { status: "revision_conflict" } as const;
  const snapshot = await deps.validateSnapshot(input.record, source);
  if (
    !snapshot.valid ||
    !Number.isSafeInteger(snapshot.inventoryVersion) ||
    snapshot.inventoryVersion < 0
  )
    return { status: "invalid_snapshot" } as const;
  const ids = referencedMediaIds(source);
  if (ids.length > MAX_PUBLICATION_IMAGES)
    return { status: "too_many_images" } as const;
  const files = [];
  let total = 0;
  for (const id of ids) {
    const file = await deps.store.readMedia(id);
    if (!file) return { status: "publication_image_missing" } as const;
    total += file.bytes.length;
    if (total > MAX_PUBLICATION_MEDIA_BYTES)
      return { status: "publication_images_too_large" } as const;
    if (
      !file.bytes.length ||
      file.metadata.id !== id ||
      file.metadata.size !== file.bytes.length ||
      hash(file.bytes) !== id.split(".")[0]
    )
      return { status: "publication_image_corrupt" } as const;
    files.push(file);
  }
  // The bucket is private. Public readers must authorize keys by published references.
  // A conflict can leave harmless immutable staged blobs, never a public draft.
  for (const file of files) {
    const key = file.metadata.id;
    await deps.media.put(key, new Uint8Array(file.bytes), {
      sha256: hash(file.bytes),
      httpMetadata: { contentType: file.metadata.type },
    });
    const copied = await deps.media.get(key);
    if (
      !copied ||
      hash(new Uint8Array(await copied.arrayBuffer())) !== hash(file.bytes)
    )
      return { status: "publication_image_copy_failed" } as const;
  }
  return publishDirect(deps.db, {
    record: input.record,
    source,
    revision: input.expectedRevision,
    operationId: input.operationId,
    expectedPublicationId: input.expectedPublicationId,
    publishedAt: (deps.now?.() ?? new Date()).toISOString(),
    expectedInventoryVersion: snapshot.inventoryVersion,
  });
}
