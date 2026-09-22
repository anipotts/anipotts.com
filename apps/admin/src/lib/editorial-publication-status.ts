import type { EditorialRecord } from "@anipotts/content/editorial/source";

export type StartDirectPublication = {
  record: EditorialRecord;
  operationId: string;
  expectedRevision: number;
  reviewedSourceSha256: string;
  expectedPublicationId: string | null;
  expectedBaselineSha256: string;
  /** Publish (the default) activates the reviewed private draft. Unpublish
   * activates the current public source with its visibility switched off. */
  action?: "publish" | "unpublish";
  /** Unpublish only: the public source the server read for this record. The
   * publisher derives the hidden revision from it and checks both hashes. */
  baselineSource?: string;
};

/** Owner-only publication metadata. Never includes source or provider payloads. */
export type DirectPublicationStatus = {
  mode: "direct";
  /** Absent from releases before unpublishing existed; read as publish. */
  action?: "publish" | "unpublish";
  id: string;
  /** Immutable private revision approved for this operation. */
  revision: number;
  phase: "validate" | "commit" | "verify" | "live" | "cancelled";
  version: number;
  attempts: number;
  dueAt: number;
  lease: string | null;
  leaseUntil: number;
  blocked: string | null;
  checkpoint: Record<string, string>;
  canCancel: boolean;
  /** Per-record pending count and the actual persisted DO alarm. */
  queue: {
    position: null;
    pending: number;
    head: null;
    alarmAt: number | null;
  };
  publicationId: string | null;
  sourceSha256: string;
  baselineSha256: string;
  inventoryVersion: number | null;
  verifiedAt: number | null;
  superseded: boolean;
};
