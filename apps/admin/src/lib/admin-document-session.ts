/** Nonsecret document state captured synchronously before private islands load. */
export const adminDocumentSessionKey = "__adminDocumentSession";
export type AdminDocumentSession = {
  readonly generation: string | null;
  readonly storageAvailable: boolean;
  locked: boolean;
  reason: "logout" | "locked";
  lock(reason: "logout" | "locked"): void;
};
export function documentSession(): AdminDocumentSession | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as Record<string, AdminDocumentSession>)[
      adminDocumentSessionKey
    ] ?? null
  );
}
