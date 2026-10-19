import {
  BrowserRecoveryVault,
  RecoveryEncryptionError,
  type RecoveryEncryptionContext,
} from "./browser-recovery-encryption";
import {
  protectedSessionIsLocked,
  watchProtectedSession,
  type AdminSessionLockReason,
} from "./protected-admin-json";

type Snapshot = {
  status: "locked" | "unlocked" | "closing";
  keyId: string | null;
  lost: boolean;
};
export type RecoveryCapability = Readonly<{ keyId: string }>;
/** Owns key lifetime independently of React unmounts. Captures run synchronously
 * before protected-document teardown; only already captured expiry work drains. */
export class RecoverySession {
  readonly vault = new BrowserRecoveryVault();
  #snapshot: Snapshot = { status: "locked", keyId: null, lost: false };
  #listeners = new Set<() => void>();
  #captures = new Set<() => Promise<unknown>>();
  #epoch = 0;
  #pending = new Set<Promise<unknown>>();
  #capability: RecoveryCapability | null = null;
  constructor(private admitted: () => boolean) {}
  snapshot = () => this.#snapshot;
  track<T>(operation: Promise<T>): Promise<T> {
    this.#pending.add(operation);
    void operation.then(
      () => this.#pending.delete(operation),
      () => this.#pending.delete(operation),
    );
    return operation;
  }
  async settled() {
    await Promise.allSettled([...this.#pending]);
  }
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  #set(status: Snapshot["status"], lost = false) {
    this.#snapshot = {
      status,
      keyId:
        this.vault.state.status === "unlocked" ? this.vault.state.keyId : null,
      lost,
    };
    for (const listener of this.#listeners) listener();
  }
  canWrite(final = false) {
    return (
      (this.#snapshot.status === "unlocked" && this.admitted()) ||
      (final && this.#snapshot.status === "closing")
    );
  }
  canRead() {
    return this.#snapshot.status === "unlocked" && this.admitted();
  }
  capability() {
    return this.#capability;
  }
  owns(capability: RecoveryCapability | null, final = false) {
    const key = this.vault.state;
    return (
      capability !== null &&
      capability === this.#capability &&
      key.status === "unlocked" &&
      key.keyId === capability.keyId &&
      (final
        ? this.#snapshot.status === "closing"
        : this.#snapshot.status === "unlocked" && this.admitted())
    );
  }
  capture(callback: () => Promise<unknown>) {
    this.#captures.add(callback);
    return () => {
      this.#captures.delete(callback);
    };
  }
  async unlock(file: string, scope: string, expected?: string) {
    const epoch = ++this.#epoch;
    this.#capability = null;
    this.vault.lock();
    this.#set("locked");
    try {
      if (!this.admitted()) throw new RecoveryEncryptionError("stale");
      const imported = await this.vault.unlock(file);
      if (epoch !== this.#epoch) throw new RecoveryEncryptionError("stale");
      if (expected && imported.keyId !== expected)
        throw new RecoveryEncryptionError("key-id-mismatch");
      const context: RecoveryEncryptionContext = {
        origin: location.origin,
        ownerScope: scope,
        recordKind: "new-writing",
        recordId: "key-custody-challenge",
        logoutGeneration: null,
      };
      const challenge = crypto.randomUUID();
      const encrypted = await this.vault.encrypt(challenge, context);
      if ((await this.vault.decrypt(encrypted, context)) !== challenge)
        throw new RecoveryEncryptionError("authentication-failed");
      if (epoch !== this.#epoch || !this.admitted())
        throw new RecoveryEncryptionError("stale");
      this.#capability = Object.freeze({ keyId: imported.keyId });
      this.#set("unlocked");
    } catch (error) {
      // A rejected challenge must release imported handles. An older failed
      // attempt has no authority to revoke a newer import or capability.
      if (epoch === this.#epoch) this.lock();
      throw error;
    }
  }
  lock(lost = false) {
    this.#epoch++;
    this.#capability = null;
    this.vault.lock(lost ? "key-lost" : "key-required");
    this.#set("locked", lost);
  }
  end(reason: AdminSessionLockReason, immediate = false) {
    if (reason === "logout" || immediate) {
      this.lock();
      return;
    }
    if (this.#snapshot.status === "locked") {
      // A key can be imported while its custody challenge is still pending.
      // Expiry must revoke that attempt even before a capability is admitted.
      this.lock(this.#snapshot.lost);
      return;
    }
    if (this.#snapshot.status !== "unlocked") return;
    const epoch = ++this.#epoch;
    this.#snapshot = { ...this.#snapshot, status: "closing" };
    const work = [...this.#captures].map((capture) => {
      try {
        return capture();
      } catch {
        return Promise.resolve();
      }
    });
    for (const listener of this.#listeners) listener();
    const timer = setTimeout(() => {
      if (this.#epoch === epoch) this.lock();
    }, 1500);
    void Promise.allSettled(work).finally(() => {
      clearTimeout(timer);
      if (this.#epoch === epoch) this.lock();
    });
  }
}
let shared: RecoverySession | undefined;
export function recoverySession() {
  if (!shared) {
    shared = new RecoverySession(() => !protectedSessionIsLocked());
    // Capture phase runs before the head bootstrap and module's bubble handlers.
    window.addEventListener("pagehide", () => shared?.end("locked", true), {
      capture: true,
    });
    watchProtectedSession((reason) => shared?.end(reason));
  }
  return shared;
}
