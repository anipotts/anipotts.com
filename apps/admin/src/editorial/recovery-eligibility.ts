import type { PublicationDatabase } from "@anipotts/content/editorial/direct-publication";

/** Deliberately no operational enrollment implementation. A migrated database
 * does not prove old Worker/R2 writes were admitted by the new protocol. The
 * isolated local test config alone substitutes its known-current-writer adapter.
 * There is no public boolean, caller token, flag or production wiring to opt in. */
export function assertRecoveryWriterCohort(
  _db: PublicationDatabase,
  _bucket: R2Bucket,
  _applicationRevision: string,
): void {
  throw new Error("recovery_operational_cohort_unsupported");
}
