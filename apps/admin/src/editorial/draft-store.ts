import { DurableObject } from "cloudflare:workers";
import { EditorialMediaStore } from "./media-store";
import {
  referencedMediaIds,
  MAX_PUBLICATION_IMAGES,
  MAX_PUBLICATION_MEDIA_BYTES,
} from "../lib/editorial-media";
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
        | "save_reconciliation_required"
        | "draft_base_changed";
    };

export type HistoryPage = {
  history: Draft[];
  nextBeforeRevision: number | null;
};
export type HistoryPageOptions = { beforeRevision?: number; limit?: number };

type SaveIdentity = {
  key: string;
  payloadHash: string;
  // Null on rows written before this column existed; those keep matching a
  // retry on payloadHash alone.
  clientHash: string | null;
  outcome: "saved" | "conflict";
  revision: number | null;
  // Exact conflict receipts include the active draft's publication-adjusted
  // base, which can differ from its immutable revision. This existing column
  // also retains legacy successful receipts whose revisions were pruned.
  legacyResult: string | null;
};

const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const gitHash = /^[a-f0-9]{40}$/;
const cachedSaveReceipts = 100;
const maxHistoryPageSize = 100;
const maxHistoryPageBytes = 4 * 1024 * 1024;

/** One object per site/environment is the serialization boundary for its editor. */
export class EditorialDraftStore extends DurableObject<unknown> {
  async saveMedia(bytes: Uint8Array) {
    return new EditorialMediaStore(this.ctx.storage).save(bytes);
  }
  async readMedia(id: string) {
    return new EditorialMediaStore(this.ctx.storage).read(id);
  }
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
        if (
          job.checkpoint.cancelRequested === "true" &&
          ["validate", "commit"].includes(job.phase)
        )
          return { next: "cancelled" };
        if (!runtime?.publishing)
          return { blocked: "publisher_not_configured" };
        const publication = this.readPublication(job.id);
        if (!publication) return { blocked: "publication_missing" };
        if (job.phase === "validate" || job.phase === "commit") {
          const ids = referencedMediaIds(publication.source);
          if (ids.length > MAX_PUBLICATION_IMAGES)
            return { blocked: "too_many_images" };
          let total = 0;
          publication.attachments = [];
          for (const id of ids) {
            const media = await this.readMedia(id);
            if (!media) return { blocked: "publication_image_missing" };
            total += media.bytes.length;
            if (total > MAX_PUBLICATION_MEDIA_BYTES)
              return { blocked: "publication_images_too_large" };
            publication.attachments.push({
              id,
              base64: Buffer.from(media.bytes).toString("base64"),
            });
          }
        }
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
  async cancelPublication(
    record: EditorialRecord,
    id: string,
    expectedVersion: number,
  ): Promise<{ ok: true } | { ok: false; code: "publication_conflict" }> {
    const job = await this.publicationStatus(record, id);
    if (
      !job ||
      job.version !== expectedVersion ||
      job.lease !== null ||
      !["validate", "commit", "branch", "pr", "checks"].includes(job.phase)
    )
      return { ok: false, code: "publication_conflict" };
    await this.ctx.storage.setAlarm(Date.now() + 1000);
    return this.jobs.requestCancel(id, expectedVersion, Date.now())
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
      -- Keep retention effective after an application rollback. IGNORE lets the
      -- previous writer's pruning DELETE succeed without losing authored rows
      -- or aborting its save. Only a controlled migration may remove this guard;
      -- it does not protect against DROP TABLE or database replacement.
      CREATE TRIGGER IF NOT EXISTS editorial_revisions_retained
      BEFORE DELETE ON revisions BEGIN
        SELECT RAISE(IGNORE);
      END;
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
      CREATE TABLE IF NOT EXISTS save_request_identities (
        id TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        payloadHash TEXT NOT NULL,
        -- Hash of the client-controlled request only. payloadHash also covers
        -- the server-derived Git base, which freezePublication rewrites in
        -- place, so an unchanged retry after a publication no longer matches
        -- it. Rows written before this column exists stay NULL and keep
        -- matching on payloadHash alone.
        clientHash TEXT,
        outcome TEXT NOT NULL CHECK (outcome IN ('saved', 'conflict')),
        revision INTEGER,
        legacyResult TEXT
      );
      CREATE INDEX IF NOT EXISTS save_requests_key ON save_requests (key);
      INSERT OR IGNORE INTO save_request_identities
        (id, key, payloadHash, outcome, revision, legacyResult)
      SELECT requests.id, requests.key, requests.payloadHash,
        CASE WHEN json_extract(requests.result, '$.ok') = 1 THEN 'saved' ELSE 'conflict' END,
        COALESCE(json_extract(requests.result, '$.draft.revision'), json_extract(requests.result, '$.current.revision')),
        CASE WHEN json_extract(requests.result, '$.ok') = 0 OR
          (COALESCE(json_extract(requests.result, '$.draft.revision'), json_extract(requests.result, '$.current.revision')) IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM revisions WHERE revisions.key = requests.key
              AND revisions.revision = COALESCE(json_extract(requests.result, '$.draft.revision'), json_extract(requests.result, '$.current.revision'))
          )) THEN requests.result ELSE NULL END
      FROM save_requests AS requests
      WHERE NOT EXISTS (SELECT 1 FROM save_request_identities AS existing WHERE existing.id = requests.id);
      UPDATE save_request_identities AS identities
      SET legacyResult = requests.result
      FROM save_requests AS requests
      WHERE identities.id = requests.id AND identities.key = requests.key
        AND identities.payloadHash = requests.payloadHash
        AND identities.outcome = 'conflict' AND identities.legacyResult IS NULL
        AND json_extract(requests.result, '$.ok') = 0;
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
    // Additive upgrade for objects created before clientHash existed. Their
    // rows keep a NULL clientHash and their original payloadHash semantics.
    const identityColumns = ctx.storage.sql
      .exec<{ name: string }>("PRAGMA table_info(save_request_identities)")
      .toArray();
    if (!identityColumns.some((column) => column.name === "clientHash"))
      ctx.storage.sql.exec(
        "ALTER TABLE save_request_identities ADD COLUMN clientHash TEXT",
      );
  }

  async get(record: EditorialRecord): Promise<Draft | null> {
    return this.read(editorialRecordPath(record));
  }

  /** Owner-only inventory. Draft source never enters a public content collection. */
  async listWritingDrafts(): Promise<Draft[]> {
    return this.ctx.storage.sql
      .exec<Draft>(
        "SELECT * FROM drafts WHERE key LIKE 'content/public/writing/%' AND discardedAt IS NULL ORDER BY updatedAt DESC",
      )
      .toArray();
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
        const bytes = Buffer.from(draft.source);
        const sourceHash = createHash("sha1")
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest("hex");
        if (sourceHash === draft.baseFileHash)
          return { ok: false, code: "no_changes" };
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
    return this.saveDraft(input, false);
  }

  /** Only the owner API supplies a freshly verified, explicitly compared base. */
  async rebase(input: SaveDraft): Promise<SaveResult> {
    return this.saveDraft(input, true);
  }

  private async saveDraft(
    input: SaveDraft,
    rebase: boolean,
  ): Promise<SaveResult> {
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
    const hex = (digest: ArrayBuffer) =>
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
    const sha256 = async (value: unknown) =>
      hex(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(JSON.stringify(value)),
        ),
      );
    const payloadHash = await sha256({
      key,
      source: input.source,
      expectedRevision: input.expectedRevision,
      baseCommit: input.baseCommit,
      baseFileHash: input.baseFileHash,
      ...(rebase ? { rebase: true } : {}),
    });
    // The caller supplies only these fields; baseCommit/baseFileHash are read
    // from the draft this request is saving against, and freezePublication
    // rewrites them in place. Retry identity must not move when that happens.
    const clientHash = await sha256({
      key,
      source: input.source,
      expectedRevision: input.expectedRevision,
      ...(rebase ? { rebase: true } : {}),
    });
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
      const identity = this.ctx.storage.sql
        .exec<SaveIdentity>(
          "SELECT key, payloadHash, clientHash, outcome, revision, legacyResult FROM save_request_identities WHERE id = ?",
          input.requestId,
        )
        .toArray()[0];
      if (identity) {
        // Match the client-controlled hash when this row has one. A retry whose
        // caller-supplied fields are unchanged must replay its original outcome
        // even after freezePublication rewrote the draft's Git base, which
        // payloadHash covers. Rows written before clientHash existed have NULL
        // and keep their original payloadHash-only semantics.
        const sameRequest =
          identity.clientHash === null || identity.clientHash === undefined
            ? identity.payloadHash === payloadHash
            : identity.clientHash === clientHash;
        if (!sameRequest) return { ok: false, code: "idempotency_key_reused" };
        if (identity.legacyResult)
          return JSON.parse(identity.legacyResult) as SaveResult;
        // Earlier compact conflict identities did not retain the active draft's
        // full metadata. If the exact receipt is gone, never invent its outcome
        // from a historical revision or the now-current draft.
        if (identity.outcome === "conflict")
          return { ok: false, code: "save_reconciliation_required" };
        const snapshot =
          identity.revision === null
            ? null
            : this.readRevision(identity.key, identity.revision);
        return snapshot
          ? { ok: true, draft: snapshot }
          : { ok: false, code: "save_reconciliation_required" };
      }
      // An older release may have pruned this conflict's receipt before the
      // identity table existed. Its source survives, but its base/hash and exact
      // original current revision cannot be proven. Never overwrite or replay it.
      const legacyConflict = this.ctx.storage.sql
        .exec<{ key: string; source: string; expectedRevision: number }>(
          "SELECT key, source, expectedRevision FROM conflicts WHERE id = ?",
          input.requestId,
        )
        .toArray()[0];
      if (legacyConflict)
        return {
          ok: false,
          code:
            legacyConflict.key === key &&
            legacyConflict.source === input.source &&
            legacyConflict.expectedRevision === input.expectedRevision
              ? "save_reconciliation_required"
              : "idempotency_key_reused",
        };
      const current = this.read(key);
      let result: SaveResult;
      if (
        (current?.revision ?? 0) !== input.expectedRevision ||
        (current !== null && current.discardedAt !== null) ||
        (rebase && current === null)
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
          !rebase &&
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
        "INSERT INTO save_request_identities (id, key, payloadHash, clientHash, outcome, revision, legacyResult) VALUES (?, ?, ?, ?, ?, ?, ?)",
        input.requestId,
        key,
        payloadHash,
        clientHash,
        result.ok ? "saved" : "conflict",
        result.ok ? result.draft.revision : (result.current?.revision ?? null),
        result.ok ? null : JSON.stringify(result),
      );
      this.ctx.storage.sql.exec(
        "INSERT INTO save_requests (id, key, payloadHash, result) VALUES (?, ?, ?, ?)",
        input.requestId,
        key,
        payloadHash,
        JSON.stringify(result),
      );
      // Bound duplicate response snapshots, not authored history or identities.
      // Old retries resolve to the original immutable revision/conflict outcome.
      this.ctx.storage.sql.exec(
        "DELETE FROM save_requests WHERE key = ? AND rowid NOT IN (SELECT rowid FROM save_requests WHERE key = ? ORDER BY rowid DESC LIMIT ?)",
        key,
        key,
        cachedSaveReceipts,
      );
      return result;
    });
  }

  async history(record: EditorialRecord): Promise<Draft[]> {
    return (await this.historyPage(record)).history;
  }

  async historyPage(
    record: EditorialRecord,
    options: HistoryPageOptions = {},
  ): Promise<HistoryPage> {
    const key = editorialRecordPath(record);
    const limit = options.limit ?? maxHistoryPageSize;
    const beforeRevision = options.beforeRevision ?? Number.MAX_SAFE_INTEGER;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > maxHistoryPageSize ||
      !Number.isSafeInteger(beforeRevision) ||
      beforeRevision < 1
    )
      throw new Error("invalid_history_page");
    const history: Draft[] = [];
    let bytes = 0;
    for (const row of this.ctx.storage.sql.exec<{ snapshot: string }>(
      "SELECT snapshot FROM revisions WHERE key = ? AND revision < ? ORDER BY revision DESC LIMIT ?",
      key,
      beforeRevision,
      limit + 1,
    )) {
      const nextBytes = new TextEncoder().encode(row.snapshot).byteLength;
      if (
        history.length === limit ||
        (history.length > 0 && bytes + nextBytes > maxHistoryPageBytes)
      )
        return {
          history,
          nextBeforeRevision: history.at(-1)!.revision,
        };
      history.push(JSON.parse(row.snapshot) as Draft);
      bytes += nextBytes;
    }
    return { history, nextBeforeRevision: null };
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

  private readRevision(key: string, revision: number): Draft | null {
    const row = this.ctx.storage.sql
      .exec<{ snapshot: string }>(
        "SELECT snapshot FROM revisions WHERE key = ? AND revision = ?",
        key,
        revision,
      )
      .toArray()[0];
    return row ? (JSON.parse(row.snapshot) as Draft) : null;
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
  }
}
