import { MAX_SOURCE_BYTES } from "@anipotts/content/editorial/record";
import type { Draft, SaveResult } from "../editorial/draft-store";
import { discardBody } from "./response-body";

type Pending = { source: string; expectedRevision: number; requestId: string };
/** A save outcome, or a source this client refuses to send at all. */
export type SaveAttempt = SaveResult | { ok: false; code: "source_too_large" };
type SaveFailureCode = Exclude<
  Extract<SaveAttempt, { ok: false }>["code"],
  "revision_conflict"
>;
export type RecoverySnapshot = {
  source: string;
  saved: string;
  revision: number;
  pending: Pending | null;
};
export type SaveState = {
  source: string;
  revision: number;
  status: "saved" | "unsaved" | "saving" | "conflict";
  saveFailed?: boolean;
  saveFailureCode?: SaveFailureCode;
  conflict: Extract<SaveResult, { code: "revision_conflict" }> | null;
};

/** The server refuses these exact bytes every time and stores nothing for them. */
export const saveRefused = (code: SaveFailureCode | undefined) =>
  code === "invalid_draft_request" || code === "source_too_large";
/** The earlier operation's outcome is unknown; only an explicit choice continues. */
export const saveNeedsComparison = (code: SaveFailureCode | undefined) =>
  code === "save_reconciliation_required" || code === "idempotency_key_reused";

const refusals = new Set<string>([
  "invalid_draft_request",
  "idempotency_key_reused",
  "draft_base_changed",
]);
/**
 * Read a save response. Only the draft store's own refusals are answers; every
 * other failure, including API validation 400s, stays ambiguous and throws.
 */
export async function readSaveResponse(
  response: Response,
): Promise<SaveResult> {
  if (response.ok || response.status === 409) return response.json();
  if (response.status === 400) {
    const body: unknown = await response.json().catch(() => null);
    if (
      body &&
      typeof body === "object" &&
      "ok" in body &&
      body.ok === false &&
      "code" in body &&
      typeof body.code === "string" &&
      refusals.has(body.code)
    )
      return { ok: false, code: body.code } as SaveResult;
  }
  discardBody(response);
  throw new Error("save unavailable");
}

/** Serialize saves; an ambiguous retry must reuse its original operation id. */
export class HomeAutosave {
  state: SaveState;
  private saved: string;
  private pending: Pending | null = null;
  /** Source of the last refused operation. Sending it again cannot succeed. */
  private refused: string | null = null;
  private active: Promise<void> | null = null;
  constructor(
    source: string,
    revision: number,
    private send: (input: Pending) => Promise<SaveAttempt>,
    private notify: (state: SaveState) => void,
  ) {
    this.saved = source;
    this.state = { source, revision, status: "saved", conflict: null };
  }
  recovery(): RecoverySnapshot {
    return {
      source: this.state.source,
      saved: this.saved,
      revision: this.state.revision,
      pending: this.pending ? { ...this.pending } : null,
    };
  }
  recover(snapshot: RecoverySnapshot) {
    // Preserve the old revision and operation identity. Server changes must conflict.
    this.saved = snapshot.saved;
    this.pending = snapshot.pending;
    this.state = { ...this.state, revision: snapshot.revision };
    this.edit(snapshot.source);
  }
  edit(source: string) {
    // Returning to the acknowledged source leaves no refused text to explain.
    const refusalSettled =
      !this.pending &&
      source === this.saved &&
      saveRefused(this.state.saveFailureCode);
    if (refusalSettled) this.refused = null;
    this.state = {
      ...this.state,
      ...(refusalSettled
        ? { saveFailed: false, saveFailureCode: undefined }
        : {}),
      source,
      status: this.state.conflict
        ? "conflict"
        : this.pending
          ? "unsaved"
          : source === this.saved
            ? "saved"
            : "unsaved",
    };
    this.notify(this.state);
  }
  flush(): Promise<void> {
    if (this.active) return this.active;
    this.active = this.drain().finally(() => {
      this.active = null;
    });
    return this.active;
  }
  /** Preview needs a stored revision even before the first text edit. */
  ensureDraft(): Promise<void> {
    if (
      this.state.revision === 0 &&
      !this.state.conflict &&
      this.state.source !== this.refused
    )
      this.pending ??= {
        source: this.state.source,
        expectedRevision: 0,
        requestId: crypto.randomUUID(),
      };
    return this.flush();
  }
  /** Explicit new review after cancellation needs a fresh private revision even
   * when its text is unchanged. Use the ordinary durable save/recovery identity;
   * never replace pending work or bypass a failure/conflict to manufacture one. */
  checkpoint(): Promise<void> {
    if (
      !this.active &&
      !this.pending &&
      this.state.status === "saved" &&
      !this.state.saveFailed &&
      !this.state.conflict &&
      this.state.source !== this.refused
    )
      this.pending = {
        source: this.state.source,
        expectedRevision: this.state.revision,
        requestId: crypto.randomUUID(),
      };
    return this.flush();
  }
  private async drain() {
    while (
      !this.state.conflict &&
      !saveNeedsComparison(this.state.saveFailureCode) &&
      (this.pending || this.state.source !== this.saved)
    ) {
      if (!this.pending && this.state.source === this.refused) return;
      this.pending ??= {
        source: this.state.source,
        expectedRevision: this.state.revision,
        requestId: crypto.randomUUID(),
      };
      if (
        new TextEncoder().encode(this.pending.source).byteLength >
        MAX_SOURCE_BYTES
      ) {
        // The draft store and the API body limit both refuse this source.
        this.refuse("source_too_large");
        continue;
      }
      this.state = {
        ...this.state,
        status: "saving",
        saveFailed: false,
        saveFailureCode: undefined,
      };
      this.notify(this.state);
      try {
        const result = await this.send(this.pending);
        if (
          !result.ok &&
          (result.code === "invalid_draft_request" ||
            result.code === "source_too_large")
        ) {
          this.refuse(result.code);
          continue;
        }
        if (!result.ok) {
          this.state = {
            ...this.state,
            status:
              result.code === "revision_conflict" ? "conflict" : "unsaved",
            conflict: result.code === "revision_conflict" ? result : null,
            saveFailed: result.code !== "revision_conflict",
            saveFailureCode:
              result.code === "revision_conflict" ? undefined : result.code,
          };
          this.notify(this.state);
          return;
        }
        this.saved = this.pending.source;
        this.pending = null;
        this.refused = null;
        this.state = {
          ...this.state,
          revision: result.draft.revision,
          status: this.state.source === this.saved ? "saved" : "unsaved",
        };
        this.notify(this.state);
      } catch {
        this.state = { ...this.state, status: "unsaved", saveFailed: true };
        this.notify(this.state);
        return;
      }
    }
  }
  /** A refused operation stored nothing, so it is retired rather than retried. */
  private refuse(code: SaveFailureCode) {
    // Edits may have returned to the acknowledged source while the refused
    // operation was in flight. As in edit(), that leaves no refused text to
    // explain, and no marker that would silently stall a later identical edit.
    const settled = this.state.source === this.saved;
    this.refused = settled ? null : this.pending!.source;
    this.pending = null;
    this.state = {
      ...this.state,
      status: settled ? "saved" : "unsaved",
      saveFailed: !settled,
      saveFailureCode: settled ? undefined : code,
    };
    this.notify(this.state);
  }
  /**
   * Explicit choice after showing both versions; never automatic conflict
   * resolution. With no saved draft there is nothing to overwrite, so keeping
   * the edits starts a new draft under a new operation id. A draft created in
   * the meantime still answers that save with a conflict.
   */
  resolve(current: Draft | null, keepMine: boolean) {
    if (current ? current.discardedAt !== null : !keepMine) return;
    this.refused = null;
    if (!current) {
      this.pending = {
        source: this.state.source,
        expectedRevision: 0,
        requestId: crypto.randomUUID(),
      };
      this.state = {
        source: this.state.source,
        revision: 0,
        conflict: null,
        status: "unsaved",
      };
      this.notify(this.state);
      return;
    }
    this.saved = current.source;
    this.pending = null;
    this.state = {
      source: keepMine ? this.state.source : current.source,
      revision: current.revision,
      conflict: null,
      status: keepMine ? "unsaved" : "saved",
    };
    this.notify(this.state);
  }
}
