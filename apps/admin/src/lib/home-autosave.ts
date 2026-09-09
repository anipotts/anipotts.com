import type { Draft, SaveResult } from "../editorial/draft-store";

type Pending = { source: string; expectedRevision: number; requestId: string };
export type SaveState = {
  source: string;
  revision: number;
  status: "saved" | "unsaved" | "saving" | "conflict";
  saveFailed?: boolean;
  conflict: Extract<SaveResult, { code: "revision_conflict" }> | null;
};

/** Serialize saves; an ambiguous retry must reuse its original operation id. */
export class HomeAutosave {
  state: SaveState;
  private saved: string;
  private pending: Pending | null = null;
  private active: Promise<void> | null = null;
  constructor(
    source: string,
    revision: number,
    private send: (input: Pending) => Promise<SaveResult>,
    private notify: (state: SaveState) => void,
  ) {
    this.saved = source;
    this.state = { source, revision, status: "saved", conflict: null };
  }
  edit(source: string) {
    this.state = {
      ...this.state,
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
    if (this.state.revision === 0 && !this.state.conflict)
      this.pending ??= {
        source: this.state.source,
        expectedRevision: 0,
        requestId: crypto.randomUUID(),
      };
    return this.flush();
  }
  private async drain() {
    while (
      !this.state.conflict &&
      (this.pending || this.state.source !== this.saved)
    ) {
      this.pending ??= {
        source: this.state.source,
        expectedRevision: this.state.revision,
        requestId: crypto.randomUUID(),
      };
      this.state = { ...this.state, status: "saving", saveFailed: false };
      this.notify(this.state);
      try {
        const result = await this.send(this.pending);
        if (!result.ok) {
          this.state = {
            ...this.state,
            status:
              result.code === "revision_conflict" ? "conflict" : "unsaved",
            conflict: result.code === "revision_conflict" ? result : null,
            saveFailed: result.code !== "revision_conflict",
          };
          this.notify(this.state);
          return;
        }
        this.saved = this.pending.source;
        this.pending = null;
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
  /** Explicit choice after showing both versions; never automatic conflict resolution. */
  resolve(current: Draft, keepMine: boolean) {
    if (current.discardedAt !== null) return;
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
