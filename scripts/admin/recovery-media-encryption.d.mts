import type {
  RecoveryMediaPlan,
  RecoveryMediaReader,
  RecoveryMediaManifest,
  RecoveryMediaFrame,
} from "./recovery-media-container.mjs";
export const ENCRYPTED_RECOVERY_MEDIA_FORMAT: "anipotts.editorial-recovery-media.aes256gcm";
export const ENCRYPTED_RECOVERY_MEDIA_LIMITS: Readonly<{
  headerBytes: number;
  commitBytes: number;
  timeoutMs: number;
  records: number;
}>;
export class EncryptedRecoveryMediaError extends Error {
  readonly code: string;
}
export type RecoveryMediaEncryptionContext = Readonly<{
  captureId: string;
  applicationRevision: string;
  contentSchemaVersion: 1;
  editorialGeneration: number;
  contentGeneration: number;
}>;
export type EncryptedRecoveryMediaRecord = Readonly<{
  kind: "record";
  role: "media" | "manifest" | "commit";
  sequence: number;
  objectIndex: number;
  index: number;
  length: number;
  ciphertext: Uint8Array;
  tag: Uint8Array;
}>;
export type EncryptedRecoveryMediaEvent =
  | Readonly<{ kind: "header"; serialized: string }>
  | EncryptedRecoveryMediaRecord;
export type EncryptedRecoveryMediaReceipt = Readonly<{
  mediaBytes: number;
  mediaFrames: number;
  manifestBytes: number;
  manifestHash: string;
  records: number;
  transcript: string;
}>;
export type RecoveryMediaCodecOptions = Readonly<{
  signal?: AbortSignal;
  timeoutMs?: number;
}>;
/** Each sink must consume/copy before acknowledgment, keep data staged, and
 * check the supplied signal before making final output visible. Arbitrary late
 * caller effects are outside the codec's control. abort() may leave staging. */
export type EncryptedRecoveryMediaSink = {
  write(
    event: EncryptedRecoveryMediaEvent,
    signal: AbortSignal,
  ): void | Promise<void>;
  complete(
    receipt: EncryptedRecoveryMediaReceipt,
    signal: AbortSignal,
  ): void | Promise<void>;
  abort(): void | Promise<void>;
};
export type DecryptedRecoveryMediaSink = {
  writeFrame(
    frame: RecoveryMediaFrame,
    signal: AbortSignal,
  ): void | Promise<void>;
  writeManifest(serialized: string, signal: AbortSignal): void | Promise<void>;
  abort(): void | Promise<void>;
};
export function sealEncryptedRecoveryMedia(
  plan: RecoveryMediaPlan,
  read: RecoveryMediaReader,
  key: Uint8Array,
  context: RecoveryMediaEncryptionContext,
  sink: EncryptedRecoveryMediaSink,
  options?: RecoveryMediaCodecOptions,
): Promise<EncryptedRecoveryMediaReceipt>;
export function openEncryptedRecoveryMedia(
  sourceFactory: () =>
    | AsyncIterable<EncryptedRecoveryMediaEvent>
    | Iterable<EncryptedRecoveryMediaEvent>,
  key: Uint8Array,
  expectedContext: RecoveryMediaEncryptionContext,
  sink: DecryptedRecoveryMediaSink,
  options?: RecoveryMediaCodecOptions,
): Promise<RecoveryMediaManifest>;

/** Internal strict profile shared with the additive inactive capture codec. */
export function createRecoveryFrameCodec(profile: "capture-v3"): {
  seal(
    plan: RecoveryMediaPlan,
    read: RecoveryMediaReader,
    key: Uint8Array,
    context: RecoveryMediaEncryptionContext,
    sink: import("./recovery-capture-v3.mjs").RecoveryCaptureV3Sink,
    options: RecoveryMediaCodecOptions,
    control: string,
  ): Promise<import("./recovery-capture-v3.mjs").RecoveryCaptureV3Receipt>;
  open(
    source: import("./recovery-capture-v3.mjs").RecoveryCaptureV3Source,
    key: Uint8Array,
    context: RecoveryMediaEncryptionContext,
    sink: DecryptedRecoveryMediaSink & {
      begin(
        control: string,
        receipt: import("./recovery-capture-v3.mjs").RecoveryCaptureV3Receipt,
        signal: AbortSignal,
      ): void | Promise<void>;
    },
    options: RecoveryMediaCodecOptions,
    validateControl: (serialized: string) => RecoveryMediaPlan,
  ): Promise<{
    receipt: import("./recovery-capture-v3.mjs").RecoveryCaptureV3Receipt;
  }>;
};
