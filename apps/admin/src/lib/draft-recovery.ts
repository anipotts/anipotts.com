import { MAX_SOURCE_BYTES } from "@anipotts/content/editorial/source";
import type { RecoverySnapshot } from "./home-autosave";
import {
  BrowserRecovery,
  browserRecoveryLock,
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
/** Logout clears plaintext. The generation is raised BEFORE the sweep so that a
 * write which has not yet passed its in-lock generation check can no longer
 * land; a write already inside its lock can still store bytes after the sweep,
 * so each key is swept again under its own lock. Such an envelope is already
 * unrestorable, because it carries the superseded generation and read() reports
 * it as signed-out, but the plaintext itself must not survive at rest. */
export function clearEditorialRecovery(storage: Storage) {
  storage.setItem(recoveryLogoutKey, crypto.randomUUID());
  for (const key of recoveryKeys(storage)) storage.removeItem(key);
  window.dispatchEvent(new Event(recoveryLogoutKey));
  void Promise.all(
    recoveryKeys(storage).map(async (key) => {
      const lock = browserRecoveryLock(key);
      try {
        if (lock) await lock(() => storage.removeItem(key));
        else storage.removeItem(key);
      } catch {
        // A contended or unavailable lock must not leave the bytes behind.
        storage.removeItem(key);
      }
    }),
  );
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
