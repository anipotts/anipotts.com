import { MAX_SOURCE_BYTES } from "@anipotts/content/editorial/source";

/** v1 remains readable by old tabs. New writers never mutate that namespace. */
export const recoveryLogoutGenerationKey = "editorial-recovery:logout";
export const recoveryV2Prefix = "editorial-recovery:v2:";
const format = "anipotts.browser-recovery";
const maxEnvelopeBytes = MAX_SOURCE_BYTES * 14 + 65536;
export type RecoveryProblem =
  | "corrupt"
  | "unsupported"
  | "oversized"
  | "unavailable"
  | "changed"
  | "signed-out";
export type RecoveryRead<T> =
  | { status: "missing" }
  | { status: "ready"; value: T }
  | { status: RecoveryProblem; candidates?: { label: string; value: T }[] };
export type RecoveryValidator<T> = (value: unknown) => T | null;
export type RecoveryLock = <T>(task: () => T | Promise<T>) => Promise<T>;
export const utf8Bytes = (value: string) =>
  new TextEncoder().encode(value).byteLength;
export function versionedRecoveryKey(legacyKey: string) {
  return recoveryV2Prefix + legacyKey.slice("editorial-recovery:v1:".length);
}
function parse(raw: string): unknown {
  if (utf8Bytes(raw) > maxEnvelopeBytes) throw new Error("oversized");
  return JSON.parse(raw);
}
/** One channel per mounted form. Web Locks serialize supported tabs; a stale
 * channel never overwrites another tab. Old tabs only write the separate v1 key.
 * Acknowledgment writes a tombstone so retained v1 bytes cannot resurrect edits. */
export class BrowserRecovery<T> {
  private raw: string | null = null;
  private legacyRaw: string | null = null;
  private logoutGeneration: string | null = null;
  private state: RecoveryRead<T> = { status: "missing" };
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;
  readonly key: string;
  constructor(
    private storage: Storage,
    readonly legacyKey: string,
    private kind: "draft" | "new-writing",
    private validate: RecoveryValidator<T>,
    private lock: RecoveryLock | null,
  ) {
    this.key = versionedRecoveryKey(legacyKey);
  }
  read(): RecoveryRead<T> {
    try {
      this.raw = this.storage.getItem(this.key);
      this.legacyRaw = this.storage.getItem(this.legacyKey);
      this.logoutGeneration = this.storage.getItem(recoveryLogoutGenerationKey);
      if (this.raw === null) {
        if (this.legacyRaw === null)
          return (this.state = { status: "missing" });
        const value = this.validate(parse(this.legacyRaw));
        return (this.state = value
          ? { status: "ready", value }
          : { status: "corrupt" });
      }
      const envelope = parse(this.raw) as Record<string, unknown> | null;
      if (!envelope || typeof envelope !== "object")
        return (this.state = { status: "corrupt" });
      if (
        envelope.format !== format ||
        envelope.version !== 2 ||
        envelope.kind !== this.kind ||
        Object.keys(envelope).some(
          (key) =>
            ![
              "format",
              "version",
              "kind",
              "payload",
              "legacyRaw",
              "logoutGeneration",
            ].includes(key),
        )
      )
        return (this.state = { status: "unsupported" });
      if (
        envelope.logoutGeneration !== null &&
        typeof envelope.logoutGeneration !== "string"
      )
        return (this.state = { status: "unsupported" });
      if (envelope.logoutGeneration !== this.logoutGeneration)
        return (this.state = { status: "signed-out" });
      if (envelope.legacyRaw !== null && typeof envelope.legacyRaw !== "string")
        return (this.state = { status: "corrupt" });
      const value =
        envelope.payload === null ? null : this.validate(envelope.payload);
      if (envelope.payload !== null && !value)
        return (this.state = { status: "corrupt" });
      if (envelope.legacyRaw !== this.legacyRaw) {
        const candidates: { label: string; value: T }[] = [];
        if (value) candidates.push({ label: "Current browser copy", value });
        try {
          const legacy =
            this.legacyRaw === null
              ? null
              : this.validate(parse(this.legacyRaw));
          if (legacy)
            candidates.push({ label: "Older tab copy", value: legacy });
        } catch {
          /* Opaque old bytes stay available for export. */
        }
        return (this.state = { status: "changed", candidates });
      }
      return (this.state = value
        ? { status: "ready", value }
        : { status: "missing" });
    } catch (error) {
      return (this.state = {
        status:
          error instanceof SyntaxError
            ? "corrupt"
            : error instanceof Error && error.message === "oversized"
              ? "oversized"
              : "unavailable",
      });
    }
  }
  close() {
    this.closed = true;
  }
  /** Choosing a supported candidate is explicit. Preserve the displaced envelope
   * in the private recovery archive before making this tab writable again. */
  choose(value: T): Promise<RecoveryProblem | null> {
    return this.write(value, true);
  }
  write(
    value: T | null,
    explicitChoice = false,
  ): Promise<RecoveryProblem | null> {
    const task = async (): Promise<RecoveryProblem | null> => {
      if (this.closed || !this.lock) return "unavailable";
      if (value !== null && !this.validate(value)) return "oversized";
      if (
        !["ready", "missing"].includes(this.state.status) &&
        !(explicitChoice && this.state.status === "changed")
      )
        return this.state.status as RecoveryProblem;
      try {
        return await this.lock(() => {
          if (this.closed) return "unavailable";
          if (
            this.storage.getItem(recoveryLogoutGenerationKey) !==
            this.logoutGeneration
          )
            return "signed-out";
          if (
            this.storage.getItem(this.key) !== this.raw ||
            this.storage.getItem(this.legacyKey) !== this.legacyRaw
          )
            return "changed";
          const raw = JSON.stringify({
            format,
            version: 2,
            kind: this.kind,
            payload: value,
            legacyRaw: this.legacyRaw,
            logoutGeneration: this.logoutGeneration,
          });
          if (utf8Bytes(raw) > maxEnvelopeBytes) return "oversized";
          if (explicitChoice && this.raw !== null)
            this.storage.setItem(
              `${this.key}:archive:${crypto.randomUUID()}`,
              this.raw,
            );
          this.storage.setItem(this.key, raw);
          this.raw = raw;
          this.state = value
            ? { status: "ready", value }
            : { status: "missing" };
          return null;
        });
      } catch {
        return "unavailable";
      }
    };
    const result = this.queue.then(task, task);
    this.queue = result;
    return result;
  }
  /** Exact stored strings, including unknown versions, stay opaque in exports. */
  export(): string {
    const entries: Record<string, string> = {};
    for (const key of Object.keys(this.storage)) {
      if (
        key === this.key ||
        key === this.legacyKey ||
        key.startsWith(`${this.key}:archive:`)
      ) {
        const raw = this.storage.getItem(key);
        if (raw !== null) entries[key] = raw;
      }
    }
    return JSON.stringify(
      { format: "anipotts.browser-recovery-export", version: 1, entries },
      null,
      2,
    );
  }
}
export function browserRecoveryLock(key: string): RecoveryLock | null {
  return typeof navigator !== "undefined" && navigator.locks
    ? async (task) =>
        await navigator.locks.request(
          `editorial-recovery:${key}`,
          { signal: AbortSignal.timeout(2000) },
          task,
        )
    : null;
}
