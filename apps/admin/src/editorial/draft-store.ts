import { DurableObject } from "cloudflare:workers";
import { createHash } from "node:crypto";
import { PublicationJobs, type PublishJob } from "./publication-jobs";
import { publicationAlarm } from "./publication-alarm";
import { editorialRuntime } from "./runtime";
import { publicationStage } from "./publication-stage";
import {
  editorialRecordPath,
  MAX_SOURCE_BYTES,
  validateEditorialSource,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import type {
  Publication,
  FreezePublication,
  FreezeResult,
} from "./publication";

export type Draft = {
  key: string;
  source: string;
  baseCommit: string;
  baseFileHash: string | null;
  revision: number;
  updatedAt: number;
  discardedAt: number | null;
};
export type SaveDraft = {
  record: EditorialRecord;
  source: string;
  expectedRevision: number;
  baseCommit: string;
  baseFileHash: string | null;
  requestId: string;
};
export type SaveResult =
  | { ok: true; draft: Draft }
  | {
      ok: false;
      code: "revision_conflict";
      current: Draft | null;
      conflictId: string;
    }
  | {
      ok: false;
      code:
        | "invalid_draft_request"
        | "idempotency_key_reused"
        | "draft_base_changed";
    };

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const gitHash = /^[a-f0-9]{40}$/;
const thirtyDays = 30 * 24 * 60 * 60 * 1000;
const retainedRevisions = 100;

/** One object per site/environment is the serialization boundary for its editor. */
export class EditorialDraftStore extends DurableObject<unknown> {
  private jobs: PublicationJobs;
  async startPublication(input: FreezePublication): Promise<FreezeResult> {
    // Arm first: interruption before freezing leaves only a harmless empty wake.
    // Interruption after freezing leaves a durable wake for the queued snapshot.
    await this.ctx.storage.setAlarm(Date.now() + 1000);
    return this.freezePublication(input);
  }
  async alarm(): Promise<void> {
    const runtime = editorialRuntime(this.env);
    await publicationAlarm(
      this.ctx.storage,
      this.jobs,
      async (job) => {
        if (!runtime?.publishing)
          return { blocked: "publisher_not_configured" };
        const publication = this.readPublication(job.id);
        if (!publication) return { blocked: "publication_missing" };
        return publicationStage(
          job,
          publication,
          runtime.git,
          runtime.ready,
          runtime.verify,
        );
      },
      Date.now,
      (job) => {
        const publication = this.readPublication(job.id);
        if (!publication || !job.checkpoint.mergeCommit)
          throw new Error("publication_missing");
        const draft = this.read(publication.path);
        // Later typing stays intact, but its base now includes the published revision.
        if (
          draft &&
          draft.baseCommit === publication.baseCommit &&
          draft.baseFileHash === publication.baseFileHash
        ) {
          const bytes = Buffer.from(publication.source);
          const hash = createHash("sha1")
            .update(`blob ${bytes.length}\0`)
            .update(bytes)
            .digest("hex");
          this.ctx.storage.sql.exec(
            "UPDATE drafts SET baseCommit = ?, baseFileHash = ? WHERE key = ?",
            job.checkpoint.mergeCommit,
            hash,
            publication.path,
          );
        }
      },
    );
  }

  async latestPublication(record: EditorialRecord): Promise<PublishJob | null> {
    const row = this.ctx.storage.sql
      .exec<{ id: string }>(
        "SELECT id FROM publications WHERE key = ? ORDER BY rowid DESC LIMIT 1",
        editorialRecordPath(record),
      )
      .toArray()[0];
    return row ? this.jobs.get(row.id) : null;
  }
  async publicationStatus(
    record: EditorialRecord,
    id: string,
  ): Promise<PublishJob | null> {
    let path: string;
    try {
      path = editorialRecordPath(record);
    } catch {
      return null;
    }
    return this.readPublication(id)?.path === path ? this.jobs.get(id) : null;
  }
  async retryPublication(
    record: EditorialRecord,
    id: string,
    expectedVersion: number,
  ): Promise<{ ok: true } | { ok: false; code: "publication_conflict" }> {
    const job = await this.publicationStatus(record, id);
    if (
      !job ||
      job.version !== expectedVersion ||
      !job.blocked ||
      job.lease !== null ||
      job.phase === "live"
    )
      return { ok: false, code: "publication_conflict" };
    // Schedule before releasing the hold, so interruption cannot strand a
    // runnable job. The transaction rechecks the version after this await.
    await this.ctx.storage.setAlarm(Date.now() + 1000);
    return this.jobs.retry(id, expectedVersion, Date.now())
      ? { ok: true }
      : { ok: false, code: "publication_conflict" };
  }
  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.jobs = new PublicationJobs(ctx.storage);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS drafts (
        key TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        baseCommit TEXT NOT NULL,
        baseFileHash TEXT,
        revision INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        discardedAt INTEGER
      );
      CREATE TABLE IF NOT EXISTS revisions (
        key TEXT NOT NULL,
        revision INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        PRIMARY KEY (key, revision)
      );
      CREATE TABLE IF NOT EXISTS conflicts (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        source TEXT NOT NULL,
        expectedRevision INTEGER NOT NULL,
        createdAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS save_requests (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        payloadHash TEXT NOT NULL,
        result TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS publications (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        revision INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        UNIQUE (key, revision)
      );
      CREATE TABLE IF NOT EXISTS publication_requests (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        revision INTEGER NOT NULL,
        publicationId TEXT NOT NULL
      );
    `);
  }

  async get(record: EditorialRecord): Promise<Draft | null> {
    return this.read(editorialRecordPath(record));
  }

  /** Only the authenticated publish route may call this, after disclosure consent.
   * Complete-snapshot reference and Git validation still precede any GitHub write.
   */
  async freezePublication(input: FreezePublication): Promise<FreezeResult> {
    let path: string;
    try {
      path = editorialRecordPath(input.record);
    } catch {
      return { ok: false, code: "invalid_request" };
    }
    if (
      !uuid.test(input.operationId) ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1
    )
      return { ok: false, code: "invalid_request" };
    return this.ctx.storage.transactionSync(() => {
      const receipt = this.ctx.storage.sql
        .exec<{ key: string; revision: number; publicationId: string }>(
          "SELECT key, revision, publicationId FROM publication_requests WHERE id = ?",
          input.operationId,
        )
        .toArray()[0];
      if (receipt) {
        if (receipt.key !== path || receipt.revision !== input.expectedRevision)
          return { ok: false, code: "idempotency_key_reused" };
        return {
          ok: true,
          publication: this.readPublication(receipt.publicationId)!,
        };
      }
      // A second click with a fresh request ID still refers to the same snapshot.
      const existing = this.ctx.storage.sql
        .exec<{ id: string }>(
          "SELECT id FROM publications WHERE key = ? AND revision = ?",
          path,
          input.expectedRevision,
        )
        .toArray()[0];
      let publication = existing ? this.readPublication(existing.id) : null;
      if (!publication) {
        const draft = this.read(path);
        if (
          !draft ||
          draft.discardedAt !== null ||
          draft.revision !== input.expectedRevision
        )
          return { ok: false, code: "revision_conflict" };
        try {
          if (!validateEditorialSource(input.record, draft.source).success)
            return { ok: false, code: "invalid_source" };
        } catch {
          return { ok: false, code: "invalid_source" };
        }
        publication = {
          id: input.operationId,
          record: input.record,
          revision: draft.revision,
          path,
          source: draft.source,
          baseCommit: draft.baseCommit,
          baseFileHash: draft.baseFileHash,
          createdAt: Date.now(),
        };
        this.ctx.storage.sql.exec(
          "INSERT INTO publications (id, key, revision, snapshot) VALUES (?, ?, ?, ?)",
          publication.id,
          path,
          draft.revision,
          JSON.stringify(publication),
        );
        this.jobs.enqueue(publication.id, publication.createdAt);
      }
      this.ctx.storage.sql.exec(
        "INSERT INTO publication_requests (id, key, revision, publicationId) VALUES (?, ?, ?, ?)",
        input.operationId,
        path,
        input.expectedRevision,
        publication.id,
      );
      return { ok: true, publication };
    });
  }

  async publication(
    record: EditorialRecord,
    id: string,
  ): Promise<Publication | null> {
    const result = this.readPublication(id);
    return result?.path === editorialRecordPath(record) ? result : null;
  }

  private readPublication(id: string): Publication | null {
    const row = this.ctx.storage.sql
      .exec<{ snapshot: string }>(
        "SELECT snapshot FROM publications WHERE id = ?",
        id,
      )
      .toArray()[0];
    return row ? (JSON.parse(row.snapshot) as Publication) : null;
  }

  async save(input: SaveDraft): Promise<SaveResult> {
    let key: string;
    try {
      key = editorialRecordPath(input.record);
    } catch {
      return { ok: false, code: "invalid_draft_request" };
    }
    if (
      typeof input.source !== "string" ||
      new TextEncoder().encode(input.source).byteLength > MAX_SOURCE_BYTES ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0 ||
      !gitHash.test(input.baseCommit) ||
      (input.baseFileHash !== null && !gitHash.test(input.baseFileHash)) ||
      !uuid.test(input.requestId)
    )
      return { ok: false, code: "invalid_draft_request" };

    // Hash before opening the transaction. No external await is allowed inside it.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        JSON.stringify({
          key,
          source: input.source,
          expectedRevision: input.expectedRevision,
          baseCommit: input.baseCommit,
          baseFileHash: input.baseFileHash,
        }),
      ),
    );
    const payloadHash = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    return this.ctx.storage.transactionSync(() => {
      const previous = this.ctx.storage.sql
        .exec<{ payloadHash: string; result: string }>(
          "SELECT payloadHash, result FROM save_requests WHERE id = ?",
          input.requestId,
        )
        .toArray()[0];
      if (previous) {
        if (previous.payloadHash !== payloadHash)
          return { ok: false, code: "idempotency_key_reused" };
        return JSON.parse(previous.result) as SaveResult;
      }
      const current = this.read(key);
      let result: SaveResult;
      if (
        (current?.revision ?? 0) !== input.expectedRevision ||
        (current !== null && current.discardedAt !== null)
      ) {
        const conflictId = input.requestId;
        this.ctx.storage.sql.exec(
          "INSERT INTO conflicts (id, key, source, expectedRevision, createdAt) VALUES (?, ?, ?, ?, ?)",
          conflictId,
          key,
          input.source,
          input.expectedRevision,
          Date.now(),
        );
        result = { ok: false, code: "revision_conflict", current, conflictId };
      } else {
        // A save never changes the Git base of an existing draft. Rebase is a
        // separate, explicit operation after comparing current Git content.
        if (
          current &&
          (current.baseCommit !== input.baseCommit ||
            current.baseFileHash !== input.baseFileHash)
        ) {
          return { ok: false, code: "draft_base_changed" };
        }
        const draft: Draft = {
          key,
          source: input.source,
          baseCommit: input.baseCommit,
          baseFileHash: input.baseFileHash,
          revision: input.expectedRevision + 1,
          updatedAt: Date.now(),
          discardedAt: null,
        };
        this.write(draft);
        result = { ok: true, draft };
      }
      this.ctx.storage.sql.exec(
        "INSERT INTO save_requests (id, key, payloadHash, result) VALUES (?, ?, ?, ?)",
        input.requestId,
        key,
        payloadHash,
        JSON.stringify(result),
      );
      // Retry receipts contain source snapshots, so bound these alongside
      // revisions. Older retries still fail revision checks without overwrites.
      this.ctx.storage.sql.exec(
        "DELETE FROM save_requests WHERE key = ? AND rowid NOT IN (SELECT rowid FROM save_requests WHERE key = ? ORDER BY rowid DESC LIMIT ?)",
        key,
        key,
        retainedRevisions,
      );
      return result;
    });
  }

  async history(record: EditorialRecord): Promise<Draft[]> {
    const key = editorialRecordPath(record);
    return this.ctx.storage.sql
      .exec<{ snapshot: string }>(
        "SELECT snapshot FROM revisions WHERE key = ? ORDER BY revision DESC LIMIT ?",
        key,
        retainedRevisions,
      )
      .toArray()
      .map((row) => JSON.parse(row.snapshot) as Draft);
  }

  async conflict(
    record: EditorialRecord,
    id: string,
  ): Promise<{ source: string; expectedRevision: number } | null> {
    return (
      this.ctx.storage.sql
        .exec<{ source: string; expectedRevision: number }>(
          "SELECT source, expectedRevision FROM conflicts WHERE key = ? AND id = ?",
          editorialRecordPath(record),
          id,
        )
        .toArray()[0] ?? null
    );
  }

  async discard(
    record: EditorialRecord,
    expectedRevision: number,
  ): Promise<Draft> {
    return this.changeLifecycle(record, expectedRevision, true);
  }

  async restore(
    record: EditorialRecord,
    expectedRevision: number,
  ): Promise<Draft> {
    return this.changeLifecycle(record, expectedRevision, false);
  }

  private changeLifecycle(
    record: EditorialRecord,
    expectedRevision: number,
    discard: boolean,
  ): Draft {
    return this.ctx.storage.transactionSync(() => {
      const current = this.read(editorialRecordPath(record));
      if (!current || current.revision !== expectedRevision)
        throw new Error("revision_conflict");
      if (
        !discard &&
        current.discardedAt !== null &&
        current.discardedAt + thirtyDays < Date.now()
      ) {
        throw new Error("recovery_window_expired");
      }
      const draft = {
        ...current,
        revision: current.revision + 1,
        updatedAt: Date.now(),
        discardedAt: discard ? Date.now() : null,
      };
      this.write(draft);
      return draft;
    });
  }

  private read(key: string): Draft | null {
    return (
      this.ctx.storage.sql
        .exec<Draft>("SELECT * FROM drafts WHERE key = ?", key)
        .toArray()[0] ?? null
    );
  }

  private write(draft: Draft): void {
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO drafts (key, source, baseCommit, baseFileHash, revision, updatedAt, discardedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      draft.key,
      draft.source,
      draft.baseCommit,
      draft.baseFileHash,
      draft.revision,
      draft.updatedAt,
      draft.discardedAt,
    );
    this.ctx.storage.sql.exec(
      "INSERT INTO revisions (key, revision, snapshot) VALUES (?, ?, ?)",
      draft.key,
      draft.revision,
      JSON.stringify(draft),
    );
    this.ctx.storage.sql.exec(
      "DELETE FROM revisions WHERE key = ? AND revision <= ?",
      draft.key,
      draft.revision - retainedRevisions,
    );
  }
}
