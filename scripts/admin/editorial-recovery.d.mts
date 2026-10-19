import type { RecoverySnapshot } from "./editorial-recovery-capture.mjs";
export const RECOVERY_SCHEMA: string;
export const RECOVERY_TABLES: Readonly<
  Record<
    "editorial" | "content",
    Readonly<Record<string, Readonly<Record<string, string>>>>
  >
>;
export function exportOfflineRecovery(snapshot: RecoverySnapshot): string;
export function validateOfflineRecovery(serialized: string): {
  snapshot: RecoverySnapshot;
  report: Record<string, unknown>;
};
export function recoveryHash(value: string | Uint8Array): string;
