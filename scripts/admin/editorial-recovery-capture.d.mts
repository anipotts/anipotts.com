export type SqlRow = Record<string, string | number | null>;
export type RecoverySnapshot = {
  schema: string;
  applicationRevision: string;
  contentSchemaVersion: number;
  editorial: {
    tables: Record<string, SqlRow[]>;
    kv: { key: string; encoding: string; value: unknown }[];
    alarmAt: number | null;
  };
  content: { tables: Record<string, SqlRow[]> };
  publicMedia: { key: string; type: string; base64: string }[];
};
export type RecoveryEvidence = {
  captureId: string;
  editorialGeneration: number;
  contentGeneration: number;
  schemas: { editorial: SqlRow[]; content: SqlRow[] };
  control: {
    editorial: SqlRow[];
    content: SqlRow[];
    editorialWriters: SqlRow[];
    contentWriters: SqlRow[];
    migrationLedger: SqlRow[];
    captures: SqlRow[];
  };
  objects: {
    key: string;
    etag: string;
    version: string;
    uploaded: string;
    httpMetadata: Record<string, string>;
    customMetadata: Record<string, string>;
  }[];
};
export const CAPTURE_BYTE_LIMIT: number;
export const CAPTURE_EVIDENCE_BYTE_LIMIT: number;
export function serializeRecoveryR2HttpMetadata(
  metadata: unknown,
): Record<string, string>;
export function sealRecoveryCapture(
  snapshot: RecoverySnapshot,
  evidence: RecoveryEvidence,
): string;
export function openRecoveryCapture(serialized: string): {
  snapshot: RecoverySnapshot;
  evidence: RecoveryEvidence;
  sha256: string;
  report: Record<string, unknown>;
};
