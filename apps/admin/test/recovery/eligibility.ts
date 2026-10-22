import { env } from "cloudflare:workers";
import type { PublicationDatabase } from "@anipotts/content/editorial/direct-publication";

// Selected only by vitest.recovery.config.ts. The fixture owns fresh local
// bindings, remoteBindings:false, and all writer code from first admission.
// This is not provider rollout/drain evidence for an existing environment.
const eligibleBuckets = new WeakSet<object>([env.RECOVERY_SOURCE_MEDIA]);
export function assertRecoveryWriterCohort(
  db: PublicationDatabase,
  bucket: R2Bucket,
  revision: string,
): void {
  if (
    db !== env.RECOVERY_SOURCE_DB ||
    !eligibleBuckets.has(bucket) ||
    revision !== env.RECOVERY_APPLICATION_REVISION
  )
    throw new Error("recovery_writer_cohort_unsupported");
}
export function delayedSyntheticInventory(
  bucket: R2Bucket,
  delayMs: number,
): R2Bucket {
  if (bucket !== env.RECOVERY_SOURCE_MEDIA)
    throw new Error("recovery_writer_cohort_unsupported");
  const delayed = new Proxy(bucket, {
    get(target, property) {
      if (property === "list")
        return async (options?: R2ListOptions) => {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          return target.list(options);
        };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  eligibleBuckets.add(delayed);
  return delayed;
}
