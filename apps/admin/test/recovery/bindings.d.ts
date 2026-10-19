import type {
  CaptureFixture,
  LegacyCaptureFixture,
  InterruptedRecoveryTarget,
  SuspendedRecoveryTarget,
} from "../recovery-worker";
// This exclusively synthetic fixture intentionally has no production IDs or auth.
declare global {
  namespace Cloudflare {
    interface Env {
      RECOVERY_SOURCE: DurableObjectNamespace<CaptureFixture>;
      RECOVERY_LEGACY_SOURCE: DurableObjectNamespace<LegacyCaptureFixture>;
      RECOVERY_TARGET: DurableObjectNamespace<SuspendedRecoveryTarget>;
      RECOVERY_INTERRUPTED_TARGET: DurableObjectNamespace<InterruptedRecoveryTarget>;
      RECOVERY_SOURCE_DB: D1Database;
      RECOVERY_CONTENT_DB: D1Database;
      RECOVERY_SOURCE_MEDIA: R2Bucket;
      RECOVERY_CONTENT_MEDIA: R2Bucket;
      RECOVERY_APPLICATION_REVISION: string;
    }
  }
}
