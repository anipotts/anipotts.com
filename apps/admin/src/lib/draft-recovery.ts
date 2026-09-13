import { MAX_SOURCE_BYTES } from "@anipotts/content/editorial/source";
import type { RecoverySnapshot } from "./home-autosave";

const prefix = "editorial-recovery:v1:";
export const recoveryLogoutKey = "editorial-recovery:logout";
export function recoveryKey(
  account: string,
  record: { kind: string; id: string },
) {
  // Browser storage is origin scoped, separating local and production environments.
  return prefix + JSON.stringify([account, record.kind, record.id]);
}
export function readRecovery(
  storage: Storage,
  key: string,
): RecoverySnapshot | null {
  try {
    const value = JSON.parse(storage.getItem(key) ?? "null");
    if (
      !value ||
      typeof value.source !== "string" ||
      typeof value.saved !== "string" ||
      value.source.length > MAX_SOURCE_BYTES ||
      value.saved.length > MAX_SOURCE_BYTES ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0
    )
      return null;
    if (
      value.pending !== null &&
      (!value.pending ||
        typeof value.pending.source !== "string" ||
        value.pending.source.length > MAX_SOURCE_BYTES ||
        !Number.isSafeInteger(value.pending.expectedRevision) ||
        value.pending.expectedRevision < 0 ||
        typeof value.pending.requestId !== "string" ||
        !/^[a-f\d-]{36}$/i.test(value.pending.requestId))
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function clearEditorialRecovery(storage: Storage) {
  for (const key of Object.keys(storage))
    if (key.startsWith(prefix)) storage.removeItem(key);
  storage.setItem(recoveryLogoutKey, crypto.randomUUID());
  window.dispatchEvent(new Event(recoveryLogoutKey));
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
export function readNewWritingRecovery(
  storage: Storage,
  key: string,
): NewWritingRecovery | null {
  try {
    const raw = storage.getItem(key);
    const value = JSON.parse(raw ?? "null");
    if (
      !value ||
      typeof value.title !== "string" ||
      typeof value.slug !== "string" ||
      value.title.length > 10000 ||
      value.slug.length > 10000
    )
      return null;
    const request =
      value.request &&
      typeof value.request.key === "string" &&
      value.request.key === JSON.stringify([value.title.trim(), value.slug]) &&
      typeof value.request.id === "string" &&
      /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value.request.id)
        ? { key: value.request.key, id: value.request.id }
        : null;
    return {
      title: value.title,
      slug: value.slug,
      customSlug: value.customSlug === true,
      request,
    };
  } catch {
    return null;
  }
}
