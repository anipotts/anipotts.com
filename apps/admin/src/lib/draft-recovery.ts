import { MAX_SOURCE_BYTES } from "@anipotts/content/editorial/record";
import type { RecoverySnapshot } from "./home-autosave";
import {
  BrowserRecovery,
  browserRecoveryLock,
  browserRecoveryRecordLock,
  browserRecoveryLogoutLock,
  recoveryV2Prefix,
  recoveryLogoutGenerationKey,
  utf8Bytes,
} from "./browser-recovery";

const prefix = "editorial-recovery:v1:";
export const recoveryLogoutKey = recoveryLogoutGenerationKey;
export function recoveryKey(
  account: string,
  record: { kind: string; id: string },
) {
  // Browser storage is origin scoped, separating local and production environments.
  return prefix + JSON.stringify([account, record.kind, record.id]);
}
export function validateRecovery(value: unknown): RecoverySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const item = value as RecoverySnapshot;
  if (
    Object.keys(item).some(
      (key) => !["source", "saved", "revision", "pending"].includes(key),
    )
  )
    return null;
  if (
    typeof item.source !== "string" ||
    typeof item.saved !== "string" ||
    utf8Bytes(item.source) > MAX_SOURCE_BYTES ||
    utf8Bytes(item.saved) > MAX_SOURCE_BYTES ||
    !Number.isSafeInteger(item.revision) ||
    item.revision < 0
  )
    return null;
  if (
    item.pending !== null &&
    (!item.pending ||
      Object.keys(item.pending).some(
        (key) => !["source", "expectedRevision", "requestId"].includes(key),
      ) ||
      typeof item.pending.source !== "string" ||
      utf8Bytes(item.pending.source) > MAX_SOURCE_BYTES ||
      !Number.isSafeInteger(item.pending.expectedRevision) ||
      item.pending.expectedRevision < 0 ||
      typeof item.pending.requestId !== "string" ||
      !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(
        item.pending.requestId,
      ))
  )
    return null;
  return item;
}
export function readRecovery(
  storage: Storage,
  key: string,
): RecoverySnapshot | null {
  const result = new BrowserRecovery(
    storage,
    key,
    "draft",
    validateRecovery,
    null,
  ).read();
  return result.status === "ready" ? result.value : null;
}
export function draftRecovery(storage: Storage, key: string) {
  return new BrowserRecovery(
    storage,
    key,
    "draft",
    validateRecovery,
    browserRecoveryLock(key),
  );
}
const recoveryKeys = (storage: Storage) =>
  Object.keys(storage).filter(
    (key) => key.startsWith(prefix) || key.startsWith(recoveryV2Prefix),
  );
/** Translate every envelope/archive storage key to the writer's v1 identity. */
function recoveryRecordKey(key: string) {
  if (key.startsWith(prefix)) return key;
  const identity = key
    .slice(recoveryV2Prefix.length)
    .replace(/:archive:[a-f\d-]{36}$/i, "");
  return prefix + identity;
}
function belongsToGeneration(raw: string, generation: string) {
  try {
    const value = JSON.parse(raw);
    return (
      value?.format === "anipotts.browser-recovery" &&
      value.version === 2 &&
      value.logoutGeneration === generation
    );
  } catch {
    return false;
  }
}
/** Explicit logout invalidates channels first, then awaits coordinated plaintext
 * removal. A failure never falls back to an unlocked successful logout. Fresh
 * generation copies are preserved; acknowledged server drafts are untouched. */
export async function clearEditorialRecovery(
  storage: Storage,
): Promise<boolean> {
  try {
    const knownRecords = new Set(recoveryKeys(storage).map(recoveryRecordKey));
    const generation = crypto.randomUUID();
    storage.setItem(recoveryLogoutKey, generation);
    if (storage.getItem(recoveryLogoutKey) !== generation) return false;
    window.dispatchEvent(new Event(recoveryLogoutKey));
    const barrier = browserRecoveryLogoutLock();
    if (!barrier) return false;
    return await barrier(async () => {
      if (storage.getItem(recoveryLogoutKey) !== generation) return false;
      // The barrier has drained in-lock writers, including previously absent
      // records. Queued writers will fail their persisted generation check.
      for (const key of recoveryKeys(storage))
        knownRecords.add(recoveryRecordKey(key));
      for (const record of knownRecords) {
        const lock = browserRecoveryRecordLock(record);
        if (!lock) return false;
        await lock(() => {
          if (storage.getItem(recoveryLogoutKey) !== generation)
            throw new Error("Logout changed");
          for (const key of recoveryKeys(storage)) {
            if (recoveryRecordKey(key) !== record) continue;
            const raw = storage.getItem(key);
            if (raw === null) continue;
            if (
              key.startsWith(recoveryV2Prefix) &&
              belongsToGeneration(raw, generation)
            )
              continue;
            // Storage APIs can be instrumented/reentrant; retain replacements.
            if (storage.getItem(key) === raw) storage.removeItem(key);
          }
        });
      }
      if (storage.getItem(recoveryLogoutKey) !== generation) return false;
      return recoveryKeys(storage).every((key) => {
        const raw = storage.getItem(key);
        return (
          raw === null ||
          (key.startsWith(recoveryV2Prefix) &&
            belongsToGeneration(raw, generation))
        );
      });
    });
  } catch {
    return false;
  }
}

export type NewWritingRecovery = {
  title: string;
  slug: string;
  customSlug: boolean;
  request: { key: string; id: string } | null;
};
export function newWritingRecoveryKey(account: string) {
  return recoveryKey(account, { kind: "new-writing", id: "new" });
}
export function newProjectRecoveryKey(account: string) {
  return recoveryKey(account, { kind: "new-project", id: "new" });
}
/** Legacy sessionStorage has no owner provenance and is deliberately not read. */
export function validateNewWritingRecovery(
  value: unknown,
): NewWritingRecovery | null {
  if (!value || typeof value !== "object") return null;
  const item = value as NewWritingRecovery;
  if (
    Object.keys(item).some(
      (key) => !["title", "slug", "customSlug", "request"].includes(key),
    )
  )
    return null;
  if (
    typeof item.title !== "string" ||
    typeof item.slug !== "string" ||
    utf8Bytes(item.title) > 10000 ||
    utf8Bytes(item.slug) > 10000
  )
    return null;
  if (
    item.request != null &&
    (Object.keys(item.request).some((key) => !["key", "id"].includes(key)) ||
      typeof item.request.key !== "string" ||
      typeof item.request.id !== "string" ||
      !/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(item.request.id))
  )
    return null;
  return {
    title: item.title,
    slug: item.slug,
    customSlug: item.customSlug === true,
    request:
      item.request?.key === JSON.stringify([item.title.trim(), item.slug])
        ? item.request
        : null,
  };
}
export function readNewWritingRecovery(
  storage: Storage,
  key: string,
): NewWritingRecovery | null {
  const result = new BrowserRecovery(
    storage,
    key,
    "new-writing",
    validateNewWritingRecovery,
    null,
  ).read();
  return result.status === "ready" ? result.value : null;
}
export function writingRecovery(storage: Storage, key: string) {
  return new BrowserRecovery(
    storage,
    key,
    "new-writing",
    validateNewWritingRecovery,
    browserRecoveryLock(key),
  );
}
