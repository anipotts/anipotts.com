import type { EditorialRecord } from "@anipotts/content/editorial/source";

/** A private, immutable authorization receipt. Creating it does not disclose source. */
export type Publication = {
  id: string;
  record: EditorialRecord;
  revision: number;
  path: string;
  source: string;
  baseCommit: string;
  baseFileHash: string | null;
  createdAt: number;
};

export type FreezePublication = {
  operationId: string;
  record: EditorialRecord;
  expectedRevision: number;
};

export type FreezeResult =
  | { ok: true; publication: Publication }
  | {
      ok: false;
      code:
        | "invalid_request"
        | "revision_conflict"
        | "invalid_source"
        | "idempotency_key_reused";
    };
