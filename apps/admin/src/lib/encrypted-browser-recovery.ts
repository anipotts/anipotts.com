import {
  BrowserRecovery,
  browserRecoveryLock,
  recoveryLogoutGenerationKey,
  recoveryLogoutIntentKey,
  versionedRecoveryKey,
  type RecoveryLock,
  type RecoveryProblem,
  type RecoveryRead,
  type RecoveryValidator,
} from "./browser-recovery";
import {
  decryptRecoveryBundle,
  encryptRecoveryBundle,
  recoveryStringHash,
} from "./browser-recovery-bundle";
import {
  RecoveryEncryptionError,
  type RecoveryEncryptionContext,
} from "./browser-recovery-encryption";
import {
  recoverySession,
  type RecoverySession,
  type RecoveryCapability,
} from "./browser-recovery-session";

export const recoveryV3Prefix = "editorial-recovery:v3:";
const legacyPrefix = "editorial-recovery:v1:";
export function encryptedRecoveryLegacyKey(key: string): string | null {
  if (!key.startsWith(recoveryV3Prefix)) return null;
  try {
    const parts: unknown = JSON.parse(
      key
        .slice(recoveryV3Prefix.length)
        .replace(/:(?:archive|capture):[a-f\d-]{36}$/i, ""),
    );
    if (
      !Array.isArray(parts) ||
      parts.length !== 4 ||
      !parts.every((part) => typeof part === "string") ||
      typeof parts[3] !== "string" ||
      !/^[a-f\d]{64}$/u.test(parts[3])
    )
      return null;
    return legacyPrefix + JSON.stringify(parts.slice(0, 3));
  } catch {
    return null;
  }
}
type Observation = {
  v1: string | null;
  v2: string | null;
  current: string | null;
  captures: [string, string][];
};
function issue(error: unknown): RecoveryProblem {
  if (error instanceof RecoveryEncryptionError) {
    if (
      ["unsupported", "corrupt", "oversized", "key-usage-limit"].includes(
        error.problem,
      )
    )
      return error.problem as RecoveryProblem;
    if (
      error.problem === "authentication-failed" ||
      error.problem === "key-id-mismatch"
    )
      return "authentication-failed";
    if (error.problem === "stale" || error.problem === "context-mismatch")
      return "signed-out";
    if (error.problem === "key-required" || error.problem === "key-lost")
      return error.problem;
  }
  return error instanceof SyntaxError ? "corrupt" : "unavailable";
}
/** Supersession is not persistence and must never acknowledge durability. */
export type RecoveryWriteResult = RecoveryProblem | "superseded" | null;
const maxRecoveryBarriers = 4;
type PendingRecoveryWrite = {
  captured: string;
  explicit: boolean;
  final: boolean;
  barrier: boolean;
  resolve: (result: RecoveryWriteResult) => void;
};
/** Async v3 channel. Legacy readers are read-only; v1/v2 bytes never change.
 * Admission and exact-byte CAS are checked again after every crypto await. */
export class EncryptedBrowserRecovery<T> {
  readonly key: string;
  readonly context: RecoveryEncryptionContext;
  #observed: Observation | null = null;
  #state: RecoveryRead<T> = { status: "missing" };
  #closed = false;
  #storageUnavailable = false;
  #knownCaptures = new Map<string, string>();
  #resolvedCaptures: string[] = [];
  #activeWrite: PendingRecoveryWrite | null = null;
  #pendingWrites: PendingRecoveryWrite[] = [];
  #lock: RecoveryLock | null;
  #capability: RecoveryCapability | null;
  constructor(
    private storage: Storage,
    readonly legacyKey: string,
    private kind: "draft" | "new-writing",
    private validate: RecoveryValidator<T>,
    readonly session: RecoverySession = recoverySession(),
    lock?: RecoveryLock | null,
  ) {
    const [ownerScope, recordKind, recordId] = JSON.parse(
      legacyKey.slice(legacyPrefix.length),
    ) as string[];
    const state = session.snapshot();
    this.#capability = session.capability();
    this.key =
      recoveryV3Prefix +
      JSON.stringify([
        ownerScope,
        recordKind,
        recordId,
        state.keyId ?? "locked",
      ]);
    let logoutGeneration: string | null = null;
    try {
      logoutGeneration = storage.getItem(recoveryLogoutGenerationKey);
    } catch {
      this.#storageUnavailable = true;
    }
    this.context = {
      origin: location.origin,
      ownerScope: ownerScope!,
      recordKind: (recordKind === "work"
        ? "project"
        : recordKind) as RecoveryEncryptionContext["recordKind"],
      recordId: recordId!,
      logoutGeneration,
    };
    this.#lock = lock === undefined ? browserRecoveryLock(legacyKey) : lock;
  }
  #sample(): Observation {
    const captureKeys = Object.keys(this.storage)
      .filter((key) => key.startsWith(`${this.key}:capture:`))
      .sort();
    if (captureKeys.length > 3) throw new RecoveryEncryptionError("oversized");
    return {
      v1: this.storage.getItem(this.legacyKey),
      v2: this.storage.getItem(versionedRecoveryKey(this.legacyKey)),
      current: this.storage.getItem(this.key),
      captures: captureKeys.flatMap((key) => {
        const raw = this.storage.getItem(key);
        return raw === null ? [] : [[key, raw] as [string, string]];
      }),
    };
  }
  #valid(final = false) {
    if (this.#storageUnavailable)
      throw new RecoveryEncryptionError("unavailable");
    return (
      this.session.owns(this.#capability, final) &&
      this.storage.getItem(recoveryLogoutGenerationKey) ===
        this.context.logoutGeneration &&
      this.storage.getItem(recoveryLogoutIntentKey) === null
    );
  }
  #same(observed: Observation) {
    const now = this.#sample();
    return (
      now.v1 === observed.v1 &&
      now.v2 === observed.v2 &&
      now.current === observed.current &&
      this.#sameCaptures(now, observed)
    );
  }
  #legacy() {
    return new BrowserRecovery(
      this.storage,
      this.legacyKey,
      this.kind,
      this.validate,
      null,
    ).read();
  }
  #sameCaptures(a: Observation, b: Observation) {
    return (
      a.captures.length === b.captures.length &&
      a.captures.every(
        ([key, raw], index) =>
          b.captures[index]?.[0] === key && b.captures[index]?.[1] === raw,
      )
    );
  }
  async #decode(raw: string) {
    const decoded: unknown = JSON.parse(
      await decryptRecoveryBundle(this.session.vault, raw, this.context),
    );
    if (
      !decoded ||
      typeof decoded !== "object" ||
      Object.keys(decoded).some(
        (key) =>
          !["kind", "payload", "predecessors", "resolvedCaptures"].includes(
            key,
          ),
      )
    )
      throw new RecoveryEncryptionError("unsupported");
    const data = decoded as {
      kind: string;
      payload: unknown;
      predecessors: string;
      resolvedCaptures?: unknown;
    };
    if (
      data.kind !== this.kind ||
      typeof data.predecessors !== "string" ||
      !/^[a-f\d]{64}$/u.test(data.predecessors)
    )
      throw new RecoveryEncryptionError("corrupt");
    const value = data.payload === null ? null : this.validate(data.payload);
    if (data.payload !== null && !value)
      throw new RecoveryEncryptionError("corrupt");
    const resolved = data.resolvedCaptures ?? [];
    if (
      !Array.isArray(resolved) ||
      resolved.length > 3 ||
      resolved.some(
        (hash) => typeof hash !== "string" || !/^[a-f\d]{64}$/u.test(hash),
      )
    )
      throw new RecoveryEncryptionError("corrupt");
    return {
      value,
      predecessors: data.predecessors,
      resolved: resolved as string[],
    };
  }
  async #load(): Promise<RecoveryRead<T>> {
    if (this.#closed || !this.#valid()) return { status: "signed-out" };
    const observed = this.#sample();
    this.#observed = observed;
    this.#knownCaptures.clear();
    this.#resolvedCaptures = [];
    if (observed.captures.length > 3) return { status: "oversized" };
    let base: RecoveryRead<T>;
    if (observed.current === null) base = this.#legacy();
    else {
      try {
        const data = await this.#decode(observed.current);
        this.#resolvedCaptures = data.resolved;
        if (!this.#valid() || this.#closed) return { status: "signed-out" };
        if (!this.#same(observed)) return { status: "changed" };
        const hash = await recoveryStringHash(
          JSON.stringify([observed.v1, observed.v2]),
        );
        if (!this.#valid() || this.#closed) return { status: "signed-out" };
        if (!this.#same(observed)) return { status: "changed" };
        if (hash !== data.predecessors) {
          const legacy = this.#legacy();
          base = {
            status: "changed",
            candidates: [
              ...(data.value
                ? [{ label: "Encrypted browser copy", value: data.value }]
                : []),
              ...(legacy.status === "ready"
                ? [{ label: "Older tab copy", value: legacy.value }]
                : legacy.status === "changed"
                  ? (legacy.candidates ?? [])
                  : []),
            ],
          };
        } else
          base = data.value
            ? { status: "ready", value: data.value }
            : { status: "missing" };
      } catch (error) {
        base = { status: issue(error) };
      }
    }
    if (!this.#valid() || this.#closed || base.status === "signed-out")
      return { status: "signed-out" };
    if (!this.#same(observed)) return { status: "changed" };
    const captures: { label: string; value: T }[] = [];
    for (const [key, raw] of observed.captures) {
      const data = await this.#decode(raw);
      if (!this.#valid() || this.#closed) return { status: "signed-out" };
      if (!this.#same(observed)) return { status: "changed" };
      const hash = await recoveryStringHash(JSON.stringify([key, raw]));
      if (!this.#valid() || this.#closed) return { status: "signed-out" };
      if (!this.#same(observed)) return { status: "changed" };
      if (!data.value) throw new RecoveryEncryptionError("corrupt");
      this.#knownCaptures.set(key, raw);
      if (!this.#resolvedCaptures.includes(hash))
        captures.push({
          label: `Session ended copy ${captures.length + 1}`,
          value: data.value,
        });
    }
    if (!captures.length) return base;
    return {
      status: "changed",
      candidates: [
        ...(base.status === "ready"
          ? [{ label: "Encrypted browser copy", value: base.value }]
          : base.status === "changed"
            ? (base.candidates ?? [])
            : []),
        ...captures,
      ],
    };
  }
  async #sealContested(captured: string): Promise<RecoveryProblem | null> {
    if (!this.#valid(true)) return "signed-out";
    const observed = this.#sample();
    if (observed.captures.length > 3) return "oversized";
    // Never make room by dropping opaque or unexpectedly replaced bytes.
    const prunable = observed.captures.filter(
      ([key, raw]) => this.#knownCaptures.get(key) === raw,
    );
    if (observed.captures.length === 3 && !prunable.length)
      return "unavailable";
    const predecessors = await recoveryStringHash(
      JSON.stringify([observed.v1, observed.v2]),
    );
    if (!this.#valid(true)) return "signed-out";
    if (!this.#sameCaptures(this.#sample(), observed)) return "changed";
    const raw = await encryptRecoveryBundle(
      this.session.vault,
      JSON.stringify({
        kind: this.kind,
        payload: JSON.parse(captured),
        predecessors,
      }),
      this.context,
    );
    if (!this.#valid(true)) return "signed-out";
    if (!this.#sameCaptures(this.#sample(), observed)) return "changed";
    const key = `${this.key}:capture:${crypto.randomUUID()}`;
    if (this.storage.getItem(key) !== null) return "changed";
    this.storage.setItem(key, raw);
    const rollback = () => {
      try {
        const current = this.storage.getItem(key);
        if (current === null) return true;
        if (current !== raw) return false;
        this.storage.removeItem(key);
        return true;
      } catch {
        // Persistent storage refusal can prevent restoring the bound. Keep all
        // inaccessible bytes for opaque export rather than deleting old copies.
        return false;
      }
    };
    try {
      if (!this.#valid(true)) {
        rollback();
        return "signed-out";
      }
      if (this.storage.getItem(key) !== raw)
        return rollback() ? "changed" : "unavailable";
      if (observed.captures.length === 3) {
        const [olderKey, olderRaw] = prunable[0]!;
        if (this.storage.getItem(olderKey) !== olderRaw)
          return rollback() ? "changed" : "unavailable";
        this.storage.removeItem(olderKey);
        this.#knownCaptures.delete(olderKey);
      }
      this.#knownCaptures.set(key, raw);
      return null;
    } catch (error) {
      // Append precedes pruning to preserve all old copies if appending fails.
      // Roll back only this attempt's exact new bytes, preserving the original
      // failure even if storage also refuses that best-effort cleanup.
      rollback();
      throw error;
    }
  }
  read(): Promise<RecoveryRead<T>> {
    return this.session.track(this.#read());
  }
  async #read(): Promise<RecoveryRead<T>> {
    try {
      this.#state = this.#lock
        ? await this.#lock(() => this.#load())
        : { status: "unavailable" };
    } catch (error) {
      this.#state = { status: issue(error) };
    }
    return this.#state;
  }
  current() {
    return this.#state;
  }
  close() {
    this.#closed = true;
  }
  choose(value: T): Promise<RecoveryProblem | null> {
    return this.#schedule(
      value,
      true,
      false,
      true,
    ) as Promise<RecoveryProblem | null>;
  }
  async #contested(
    captured: string,
    final: boolean,
  ): Promise<RecoveryProblem | null> {
    if (final) return this.#sealContested(captured);
    const theirs = await this.#load();
    if (!this.#valid(final)) return "signed-out";
    const value = JSON.parse(captured) as T | null;
    this.#state = {
      status: "changed",
      candidates: [
        ...(value ? [{ label: "This tab", value }] : []),
        ...(theirs.status === "ready"
          ? [{ label: "Other tab", value: theirs.value }]
          : theirs.status === "changed"
            ? (theirs.candidates ?? [])
            : []),
      ],
    };
    return "changed";
  }
  write(value: null): Promise<RecoveryProblem | null>;
  write(value: T | null): Promise<RecoveryWriteResult>;
  write(value: T | null): Promise<RecoveryWriteResult> {
    return this.#schedule(value, false, false, value === null);
  }
  /** A complete retry identity must finish in order before its caller proceeds. */
  writeDurable(value: T): Promise<RecoveryProblem | null> {
    return this.#schedule(
      value,
      false,
      false,
      true,
    ) as Promise<RecoveryProblem | null>;
  }
  sealFinal(value: T): Promise<RecoveryProblem | null> {
    return this.#schedule(
      value,
      false,
      true,
      true,
    ) as Promise<RecoveryProblem | null>;
  }
  #discardPending(result: "superseded" | "signed-out", ordinaryOnly: boolean) {
    this.#pendingWrites = this.#pendingWrites.filter((entry) => {
      if (ordinaryOnly && entry.barrier) return true;
      entry.captured = "";
      entry.resolve(result);
      return false;
    });
  }
  #schedule(
    value: T | null,
    explicit: boolean,
    final: boolean,
    barrier: boolean,
  ): Promise<RecoveryWriteResult> {
    try {
      if ((!final && this.#closed) || !this.#valid(final))
        return Promise.resolve("signed-out");
      if (value !== null && !this.validate(value))
        return Promise.resolve("oversized");
      // Reject excess barriers before retaining their payload or disturbing the
      // latest ordinary snapshot. Durable callers receive an explicit failure.
      if (
        !final &&
        barrier &&
        Number(this.#activeWrite?.barrier ?? false) +
          this.#pendingWrites.filter((entry) => entry.barrier).length >=
          maxRecoveryBarriers
      )
        return Promise.resolve("unavailable");
      let captured: string;
      try {
        captured = JSON.stringify(value);
      } catch {
        return Promise.resolve("unavailable");
      }
      // A barrier captures its complete authoritative state, superseding older
      // replaceable input. Newer ordinary input remains AFTER existing barriers.
      // Expiry revokes all normal queued work before admitting its closing seal.
      this.#discardPending(final ? "signed-out" : "superseded", !final);
      let resolve!: (result: RecoveryWriteResult) => void;
      const result = new Promise<RecoveryWriteResult>((done) => {
        resolve = done;
      });
      this.#pendingWrites.push({ captured, explicit, final, barrier, resolve });
      this.#pump();
      return this.session.track(result);
    } catch (error) {
      return Promise.resolve(issue(error));
    }
  }
  #pump() {
    if (this.#activeWrite) return;
    const entry = this.#pendingWrites.shift();
    if (!entry) return;
    this.#activeWrite = entry;
    void Promise.resolve()
      .then(() => this.#commit(entry))
      .then(
        (result) => this.#finish(entry, result),
        (error) => this.#finish(entry, issue(error)),
      );
  }
  #finish(entry: PendingRecoveryWrite, result: RecoveryProblem | null) {
    entry.captured = "";
    this.#activeWrite = null;
    entry.resolve(result);
    this.#pump();
  }
  async #commit({
    captured,
    explicit,
    final,
  }: PendingRecoveryWrite): Promise<RecoveryProblem | null> {
    try {
      if ((!final && this.#closed) || !this.#valid(final) || !this.#lock)
        return "signed-out";
      if (
        !final &&
        (!this.#observed ||
          (!["ready", "missing"].includes(this.#state.status) &&
            !(explicit && this.#state.status === "changed")))
      )
        return this.#state.status === "missing"
          ? "unavailable"
          : (this.#state.status as RecoveryProblem);
      return await this.#lock(async () => {
        if ((!final && this.#closed) || !this.#valid(final))
          return "signed-out";
        if (
          final &&
          (!this.#observed ||
            !["ready", "missing"].includes(this.#state.status))
        )
          return this.#sealContested(captured);
        const observed = this.#observed!;
        if (!this.#same(observed)) {
          return this.#contested(captured, final);
        }
        const predecessors = await recoveryStringHash(
          JSON.stringify([observed.v1, observed.v2]),
        );
        if ((!final && this.#closed) || !this.#valid(final))
          return "signed-out";
        if (!this.#same(observed)) return this.#contested(captured, final);
        const resolvedCaptures = explicit
          ? await Promise.all(
              observed.captures.map(async ([key, raw]) =>
                recoveryStringHash(JSON.stringify([key, raw])),
              ),
            )
          : this.#resolvedCaptures;
        if ((!final && this.#closed) || !this.#valid(final))
          return "signed-out";
        if (!this.#same(observed)) return this.#contested(captured, final);
        const raw = await encryptRecoveryBundle(
          this.session.vault,
          JSON.stringify({
            kind: this.kind,
            payload: JSON.parse(captured),
            predecessors,
            ...(resolvedCaptures.length ? { resolvedCaptures } : {}),
          }),
          this.context,
        );
        if ((!final && this.#closed) || !this.#valid(final))
          return "signed-out";
        if (!this.#same(observed)) return this.#contested(captured, final);
        let archive: string | null = null;
        if (explicit && observed.current !== null) {
          archive = `${this.key}:archive:${crypto.randomUUID()}`;
          this.storage.setItem(archive, observed.current);
        }
        if (!this.#valid(final) || !this.#same(observed)) {
          if (archive && this.storage.getItem(archive) === observed.current)
            this.storage.removeItem(archive);
          return this.#valid(final)
            ? this.#contested(captured, final)
            : "signed-out";
        }
        try {
          this.storage.setItem(this.key, raw);
        } catch (error) {
          // Archiving and replacement are separate storage writes. A failed
          // replacement must not consume quota with a duplicate of the source.
          // Remove only this attempt's unchanged archive, without masking the
          // original failure if storage also refuses best-effort cleanup.
          if (archive) {
            try {
              if (this.storage.getItem(archive) === observed.current)
                this.storage.removeItem(archive);
            } catch {
              /* Preserve inaccessible or changed bytes and the original error. */
            }
          }
          throw error;
        }
        if (!this.#valid(final)) {
          if (this.storage.getItem(this.key) === raw)
            this.storage.removeItem(this.key);
          if (archive && this.storage.getItem(archive) === observed.current)
            this.storage.removeItem(archive);
          return "signed-out";
        }
        this.#observed = { ...observed, current: raw };
        this.#resolvedCaptures = resolvedCaptures;
        this.#state =
          captured !== "null"
            ? { status: "ready", value: JSON.parse(captured) as T }
            : { status: "missing" };
        // Same bounded archive policy as v2. Never prune foreign-key ciphertext.
        const archives = Object.keys(this.storage)
          .filter((key) => key.startsWith(`${this.key}:archive:`))
          .sort();
        for (const key of archives.slice(0, Math.max(0, archives.length - 3)))
          this.storage.removeItem(key);
        return null;
      });
    } catch (error) {
      return issue(error);
    }
  }
  export(
    current: T,
    selection?: { name: string; source: string },
  ): Promise<string> {
    return this.session.track(
      this.#export(current, selection).catch((error) => {
        if (error instanceof RecoveryEncryptionError) throw error;
        throw new RecoveryEncryptionError("unavailable");
      }),
    );
  }
  async #export(
    current: T,
    selection?: { name: string; source: string },
  ): Promise<string> {
    if (!this.#valid() || this.#closed)
      throw new RecoveryEncryptionError("stale");
    const entries: Record<string, string> = {};
    let storedStatus: "complete" | "unavailable" = "complete";
    try {
      for (const key of Object.keys(this.storage)) {
        if (
          key !== this.legacyKey &&
          key !== versionedRecoveryKey(this.legacyKey) &&
          !key.startsWith(`${versionedRecoveryKey(this.legacyKey)}:archive:`) &&
          !key.startsWith(`${this.key}:capture:`) &&
          encryptedRecoveryLegacyKey(key) !== this.legacyKey
        )
          continue;
        const raw = this.storage.getItem(key);
        if (raw !== null) entries[key] = raw;
      }
    } catch {
      storedStatus = "unavailable";
    }
    const result = await encryptRecoveryBundle(
      this.session.vault,
      JSON.stringify({
        format: "anipotts.browser-recovery-export",
        version: 3,
        entries,
        currentCopy: { key: this.legacyKey, kind: this.kind, payload: current },
        ...(selection ? { selectedCopy: selection } : {}),
        storedStatus,
      }),
      this.context,
    );
    if (!this.#valid() || this.#closed)
      throw new RecoveryEncryptionError("stale");
    return result;
  }
}
