import type { EditorialRecord } from "@anipotts/content/editorial/source";
import type { PublishJob } from "../editorial/publication-jobs";

/** Owner-only coordinator metadata. Never includes source or provider payloads. */
export type PublicationQueueEntry = Pick<
  PublishJob,
  "id" | "phase" | "version" | "attempts" | "dueAt" | "leaseUntil" | "blocked"
> & {
  sequence: number;
  record: EditorialRecord | null;
  revision: number | null;
  createdAt: number | null;
  cancelRequested: boolean;
};

export type PublicationQueueContext = {
  /** One-based among unfinished work; null once this operation is terminal. */
  position: number | null;
  pending: number;
  head: PublicationQueueEntry | null;
  /** Actual persisted DO alarm, not an estimated browser refresh deadline. */
  alarmAt: number | null;
};

export type PublicationStatus = PublishJob & {
  /** Immutable private revision approved for this operation. */
  revision: number;
  queue: PublicationQueueContext;
  canCancel: boolean;
};

export type PublicationQueuePage = Omit<PublicationQueueContext, "position"> & {
  items: PublicationQueueEntry[];
  nextAfterSequence: number | null;
};

export type PublicationQueueOptions = {
  afterSequence?: number;
  limit?: number;
};
export const MAX_PUBLICATION_QUEUE_PAGE = 50;

export type StartDirectPublication = {
  record: EditorialRecord;
  operationId: string;
  expectedRevision: number;
  reviewedSourceSha256: string;
  expectedPublicationId: string | null;
  expectedBaselineSha256: string;
};

export type DirectPublicationStatus = PublicationStatus & {
  mode: "direct";
  publicationId: string | null;
  sourceSha256: string;
  baselineSha256: string;
  inventoryVersion: number | null;
  verifiedAt: number | null;
  superseded: boolean;
};
