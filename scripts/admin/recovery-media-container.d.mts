export const RECOVERY_MEDIA_CONTAINER_FORMAT: "anipotts.editorial-recovery-media.plaintext";
export const RECOVERY_MEDIA_CONTAINER_LIMITS: Readonly<{
  frameBytes: number;
  objectBytes: number;
  aggregateBytes: number;
  entries: number;
  metadataBytes: number;
  evidenceBytes: number;
  manifestBytes: number;
}>;
export type RecoveryMediaEvidence =
  | null
  | boolean
  | number
  | string
  | readonly RecoveryMediaEvidence[]
  | { readonly [key: string]: RecoveryMediaEvidence };
export type RecoveryPrivateMediaObject = Readonly<{
  plane: "private";
  id: string;
  type: "image/jpeg" | "image/png" | "image/webp";
  size: number;
}>;
export type RecoveryPublicMediaObject = Readonly<{
  plane: "public";
  id: string;
  type: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  r2: Readonly<{
    etag: string;
    version: string;
    uploaded: string;
    httpMetadata: Readonly<Record<string, string>>;
    customMetadata: Readonly<Record<string, string>>;
  }>;
}>;
export type RecoveryMediaObject =
  RecoveryPrivateMediaObject | RecoveryPublicMediaObject;
export type RecoveryMediaPlan = Readonly<{
  objects: readonly RecoveryMediaObject[];
  evidence: RecoveryMediaEvidence;
}>;
export type RecoveryMediaManifest = RecoveryMediaPlan &
  Readonly<{
    format: typeof RECOVERY_MEDIA_CONTAINER_FORMAT;
    version: 1;
    totalBytes: number;
    totalFrames: number;
    sha256: string;
  }>;
export type RecoveryMediaChunk = Readonly<{
  index: number;
  bytes: Uint8Array;
}>;
export type RecoveryMediaFrame = RecoveryMediaChunk &
  Readonly<{ objectIndex: number }>;
export type RecoveryMediaReader = (
  object: RecoveryMediaObject,
  objectIndex: number,
) => AsyncIterable<RecoveryMediaChunk> | Iterable<RecoveryMediaChunk>;
/** Frames must remain staged and inaccessible until writeManifest succeeds.
 * Consume or copy each frame before acknowledging it; abort may leave partial
 * staging and never authorizes publication or operational restore. */
export type RecoveryMediaSink = {
  writeFrame(frame: RecoveryMediaFrame): void | Promise<void>;
  writeManifest(serialized: string): void | Promise<void>;
  abort(): void | Promise<void>;
};
export function readRecoveryMediaManifest(
  serialized: string,
): RecoveryMediaManifest;
export function writeRecoveryMediaContainer(
  plan: RecoveryMediaPlan,
  read: RecoveryMediaReader,
  sink: RecoveryMediaSink,
): Promise<string>;
export function verifyRecoveryMediaContainer(
  serialized: string,
  frames: AsyncIterable<RecoveryMediaFrame> | Iterable<RecoveryMediaFrame>,
  sink: RecoveryMediaSink,
): Promise<RecoveryMediaManifest>;
