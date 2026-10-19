import type {
  RecoverySnapshot,
  RecoveryEvidence,
} from "./editorial-recovery-capture.mjs";
import type {
  RecoveryMediaObject,
  RecoveryMediaReader,
  RecoveryMediaFrame,
} from "./recovery-media-container.mjs";
import type {
  RecoveryMediaEncryptionContext,
  RecoveryMediaCodecOptions,
  EncryptedRecoveryMediaReceipt,
} from "./recovery-media-encryption.mjs";
export const RECOVERY_CAPTURE_V3_FORMAT: "anipotts.editorial-capture.aes256gcm.v3";
export const RECOVERY_CAPTURE_V3_LIMITS: Readonly<{
  controlBytes: number;
  frameBytes: number;
}>;
export type RecoveryCaptureV3Document = {
  format: typeof RECOVERY_CAPTURE_V3_FORMAT;
  snapshot: Omit<RecoverySnapshot, "publicMedia">;
  objects: readonly RecoveryMediaObject[];
  evidence: RecoveryEvidence;
};
export type RecoveryCaptureV3Context = RecoveryMediaEncryptionContext;
export type RecoveryCaptureV3Receipt = EncryptedRecoveryMediaReceipt &
  Readonly<{ controlBytes: number; controlHash: string }>;
export type RecoveryCaptureV3Event =
  | Readonly<{ kind: "header"; serialized: string }>
  | Readonly<{
      kind: "record";
      role: "control" | "media" | "manifest" | "commit";
      sequence: number;
      objectIndex: number;
      index: number;
      length: number;
      ciphertext: Uint8Array;
      tag: Uint8Array;
    }>;
export type RecoveryCaptureV3Source = () =>
  AsyncIterable<RecoveryCaptureV3Event> | Iterable<RecoveryCaptureV3Event>;
export type RecoveryCaptureV3Sink = {
  write(
    event: RecoveryCaptureV3Event,
    signal: AbortSignal,
  ): void | Promise<void>;
  complete(
    receipt: RecoveryCaptureV3Receipt,
    signal: AbortSignal,
  ): void | Promise<void>;
  abort(): void | Promise<void>;
};
/** Staging remains inaccessible until complete. Consume/copy each frame before
 * acknowledgment and check signal before visibility. Partial effects are not undone. */
export type RecoveryCaptureV3RestoreSink = {
  begin(
    document: RecoveryCaptureV3Document,
    receipt: RecoveryCaptureV3Receipt,
    signal: AbortSignal,
  ): void | Promise<void>;
  writeFrame(
    frame: RecoveryMediaFrame,
    signal: AbortSignal,
  ): void | Promise<void>;
  complete(signal: AbortSignal): void | Promise<void>;
  abort(): void | Promise<void>;
};
export function copyRecoveryCaptureKey(key: Uint8Array): Uint8Array;
export function sealRecoveryCaptureV3(
  document: RecoveryCaptureV3Document,
  read: RecoveryMediaReader,
  key: Uint8Array,
  context: RecoveryCaptureV3Context,
  sink: RecoveryCaptureV3Sink,
  options?: RecoveryMediaCodecOptions,
): Promise<RecoveryCaptureV3Receipt>;
export function openRecoveryCaptureV3(
  source: RecoveryCaptureV3Source,
  key: Uint8Array,
  context: RecoveryCaptureV3Context,
  sink: RecoveryCaptureV3RestoreSink,
  options?: RecoveryMediaCodecOptions,
): Promise<RecoveryCaptureV3Opened>;
export type RecoveryCaptureV3Opened = {
  document: RecoveryCaptureV3Document;
  report: Record<string, unknown>;
  receipt: RecoveryCaptureV3Receipt;
  sha256: string;
};

export function equalRecoverySchemasV3(
  actual: readonly import("./editorial-recovery-capture.mjs").SqlRow[],
  expected: readonly import("./editorial-recovery-capture.mjs").SqlRow[],
): boolean;
