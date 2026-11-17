import type {
  Draft,
  SaveDraft,
  SaveResult,
  HistoryPage,
  HistoryPageOptions,
} from "./draft-store";
import {
  editorialRecordPath,
  MAX_SOURCE_BYTES,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import { sha256Hex, gitBlobSha1 } from "../lib/crypto";
import { GIT_SHA } from "../lib/patterns";
import { MAX_HISTORY_PAGE_BYTES } from "../lib/editorial-response-bounds";

/** Private authoring tables share CONTENT_DB with published snapshots. The
 * existing named object serializes calls; D1 batches commit source, immutable
 * history and retry receipts together. Legacy storage is never deleted. */
export const D1_DRAFT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS editorial_drafts (store TEXT NOT NULL,key TEXT NOT NULL,source TEXT NOT NULL,baseCommit TEXT NOT NULL,baseFileHash TEXT,revision INTEGER NOT NULL,updatedAt INTEGER NOT NULL,discardedAt INTEGER,PRIMARY KEY(store,key))`,
  `CREATE TABLE IF NOT EXISTS editorial_draft_history (store TEXT NOT NULL,key TEXT NOT NULL,revision INTEGER NOT NULL,snapshot TEXT NOT NULL,PRIMARY KEY(store,key,revision))`,
  `CREATE TRIGGER IF NOT EXISTS editorial_draft_history_no_delete BEFORE DELETE ON editorial_draft_history BEGIN SELECT RAISE(ABORT,'draft history is immutable'); END`,
  `CREATE TRIGGER IF NOT EXISTS editorial_draft_history_no_update BEFORE UPDATE ON editorial_draft_history BEGIN SELECT RAISE(ABORT,'draft history is immutable'); END`,
  `CREATE TABLE IF NOT EXISTS editorial_draft_conflicts (store TEXT NOT NULL,id TEXT NOT NULL,key TEXT NOT NULL,source TEXT NOT NULL,expectedRevision INTEGER NOT NULL,createdAt INTEGER NOT NULL,PRIMARY KEY(store,id))`,
  `CREATE TABLE IF NOT EXISTS editorial_draft_requests (store TEXT NOT NULL,id TEXT NOT NULL,key TEXT NOT NULL,payloadHash TEXT NOT NULL,result TEXT NOT NULL,PRIMARY KEY(store,id))`,
  `CREATE TABLE IF NOT EXISTS editorial_draft_identities (store TEXT NOT NULL,id TEXT NOT NULL,key TEXT NOT NULL,payloadHash TEXT NOT NULL,clientHash TEXT,outcome TEXT NOT NULL,revision INTEGER,legacyResult TEXT,PRIMARY KEY(store,id))`,
  `CREATE TABLE IF NOT EXISTS editorial_draft_bases (store TEXT NOT NULL,key TEXT NOT NULL,publicationId TEXT NOT NULL,inventoryVersion INTEGER NOT NULL,PRIMARY KEY(store,key))`,
  `CREATE TABLE IF NOT EXISTS editorial_draft_imports (store TEXT PRIMARY KEY,completedAt INTEGER NOT NULL,counts TEXT NOT NULL)`,
] as const;
const imports = [
  [
    "direct_published_bases",
    "editorial_draft_bases",
    ["key", "publicationId", "inventoryVersion"],
  ],
  [
    "drafts",
    "editorial_drafts",
    [
      "key",
      "source",
      "baseCommit",
      "baseFileHash",
      "revision",
      "updatedAt",
      "discardedAt",
    ],
  ],
  ["revisions", "editorial_draft_history", ["key", "revision", "snapshot"]],
  [
    "conflicts",
    "editorial_draft_conflicts",
    ["id", "key", "source", "expectedRevision", "createdAt"],
  ],
  [
    "save_requests",
    "editorial_draft_requests",
    ["id", "key", "payloadHash", "result"],
  ],
  [
    "save_request_identities",
    "editorial_draft_identities",
    [
      "id",
      "key",
      "payloadHash",
      "clientHash",
      "outcome",
      "revision",
      "legacyResult",
    ],
  ],
] as const;
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const columns =
  "key,source,baseCommit,baseFileHash,revision,updatedAt,discardedAt";
export class D1DraftRepository {
  constructor(
    private db: D1Database,
    private legacy: DurableObjectStorage,
    private store: string,
  ) {}
  private stmt(sql: string, ...values: unknown[]) {
    return this.db.prepare(sql).bind(this.store, ...values);
  }
  async migrate() {
    if (
      await this.stmt(
        "SELECT store FROM editorial_draft_imports WHERE store=?",
      ).first()
    )
      return;
    const counts: Record<string, number> = {};
    for (const [oldName, newName, fields] of imports) {
      let count = 0;
      // Copy bounded pages atomically. Retrying an interrupted page is safe;
      // compare every original value before acknowledging the import.
      let page: Record<string, string | number | null>[] = [];
      let pageBytes = 0;
      const copyPage = async () => {
        if (!page.length) return;
        const keys =
          oldName === "revisions"
            ? ["key", "revision"]
            : ["drafts", "direct_published_bases"].includes(oldName)
              ? ["key"]
              : ["id"];
        const statements = page.flatMap((row) => [
          this.stmt(
            `INSERT OR IGNORE INTO ${newName} (store,${fields.join(",")}) VALUES (${Array(
              fields.length + 1,
            )
              .fill("?")
              .join(",")})`,
            ...fields.map((field) => row[field]),
          ),
          this.stmt(
            `SELECT ${fields.join(",")} FROM ${newName} WHERE store=? AND ${keys.map((k) => `${k}=?`).join(" AND ")}`,
            ...keys.map((k) => row[k]),
          ),
        ]);
        const results =
          await this.db.batch<Record<string, unknown>>(statements);
        if (results.some((result) => !result.success))
          throw new Error("draft_import_failed");
        page.forEach((row, index) => {
          const saved = results[index * 2 + 1]?.results[0];
          if (!saved || fields.some((field) => saved[field] !== row[field]))
            throw new Error("draft_import_mismatch");
        });
        count += page.length;
        page = [];
        pageBytes = 0;
      };
      for (const row of this.legacy.sql.exec<
        Record<string, string | number | null>
      >(`SELECT ${fields.join(",")} FROM ${oldName}`)) {
        const bytes = new TextEncoder().encode(JSON.stringify(row)).byteLength;
        if (
          page.length &&
          (page.length >= 20 || pageBytes + bytes > 1024 * 1024)
        )
          await copyPage();
        page.push(row);
        pageBytes += bytes;
      }
      await copyPage();
      const actual = await this.stmt(
        `SELECT COUNT(*) AS n FROM ${newName} WHERE store=?`,
      ).first<{ n: number }>();
      if (actual?.n !== count) throw new Error("draft_import_count_mismatch");
      counts[oldName] = count;
    }
    await this.stmt(
      "INSERT INTO editorial_draft_imports VALUES (?,?,?)",
      Date.now(),
      JSON.stringify(counts),
    ).run();
  }
  async get(record: EditorialRecord) {
    return this.read(editorialRecordPath(record));
  }
  private read(key: string) {
    return this.stmt(
      `SELECT ${columns} FROM editorial_drafts WHERE store=? AND key=?`,
      key,
    ).first<Draft>();
  }
  async list(kind: "writing" | "projects") {
    return (
      await this.stmt(
        `SELECT ${columns} FROM editorial_drafts WHERE store=? AND key LIKE ? AND discardedAt IS NULL ORDER BY updatedAt DESC`,
        `content/public/${kind}/%`,
      ).all<Draft>()
    ).results;
  }
  private async revision(key: string, revision: number) {
    const row = await this.stmt(
      "SELECT snapshot FROM editorial_draft_history WHERE store=? AND key=? AND revision=?",
      key,
      revision,
    ).first<{ snapshot: string }>();
    return row ? (JSON.parse(row.snapshot) as Draft) : null;
  }
  private writes(draft: Draft) {
    return [
      this.stmt(
        `INSERT INTO editorial_drafts (store,${columns}) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(store,key) DO UPDATE SET source=excluded.source,baseCommit=excluded.baseCommit,baseFileHash=excluded.baseFileHash,revision=excluded.revision,updatedAt=excluded.updatedAt,discardedAt=excluded.discardedAt`,
        draft.key,
        draft.source,
        draft.baseCommit,
        draft.baseFileHash,
        draft.revision,
        draft.updatedAt,
        draft.discardedAt,
      ),
      this.stmt(
        "INSERT INTO editorial_draft_history VALUES (?,?,?,?)",
        draft.key,
        draft.revision,
        JSON.stringify(draft),
      ),
    ];
  }
  async save(input: SaveDraft, rebase = false): Promise<SaveResult> {
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
      !GIT_SHA.test(input.baseCommit) ||
      (input.baseFileHash !== null && !GIT_SHA.test(input.baseFileHash)) ||
      !uuid.test(input.requestId)
    )
      return { ok: false, code: "invalid_draft_request" };
    const payloadHash = await sha256Hex(
      JSON.stringify({
        key,
        source: input.source,
        expectedRevision: input.expectedRevision,
        baseCommit: input.baseCommit,
        baseFileHash: input.baseFileHash,
        ...(rebase ? { rebase: true } : {}),
      }),
    );
    const clientHash = await sha256Hex(
      JSON.stringify({
        key,
        source: input.source,
        expectedRevision: input.expectedRevision,
        ...(rebase ? { rebase: true } : {}),
      }),
    );
    const identity = await this.stmt(
      "SELECT * FROM editorial_draft_identities WHERE store=? AND id=?",
      input.requestId,
    ).first<{
      key: string;
      payloadHash: string;
      clientHash: string | null;
      outcome: string;
      revision: number | null;
      legacyResult: string | null;
    }>();
    if (identity) {
      if (
        identity.key !== key ||
        (identity.clientHash
          ? identity.clientHash !== clientHash
          : identity.payloadHash !== payloadHash)
      )
        return { ok: false, code: "idempotency_key_reused" };
      const hot = await this.stmt(
        "SELECT result FROM editorial_draft_requests WHERE store=? AND id=?",
        input.requestId,
      ).first<{ result: string }>();
      if (hot) return JSON.parse(hot.result);
      if (identity.legacyResult) return JSON.parse(identity.legacyResult);
      if (identity.outcome === "conflict" || identity.revision === null)
        return { ok: false, code: "save_reconciliation_required" };
      const draft = await this.revision(key, identity.revision);
      return draft
        ? { ok: true, draft }
        : { ok: false, code: "save_reconciliation_required" };
    }
    const legacyConflict = await this.conflict(input.record, input.requestId);
    if (legacyConflict)
      return {
        ok: false,
        code:
          legacyConflict.source === input.source &&
          legacyConflict.expectedRevision === input.expectedRevision
            ? "save_reconciliation_required"
            : "idempotency_key_reused",
      };
    const current = await this.read(key);
    let result: SaveResult;
    const statements: D1PreparedStatement[] = [];
    if (
      (current?.revision ?? 0) !== input.expectedRevision ||
      (current !== null && current.discardedAt !== null) ||
      (rebase && current === null)
    ) {
      statements.push(
        this.stmt(
          "INSERT INTO editorial_draft_conflicts VALUES (?,?,?,?,?,?)",
          input.requestId,
          key,
          input.source,
          input.expectedRevision,
          Date.now(),
        ),
      );
      result = {
        ok: false,
        code: "revision_conflict",
        current,
        conflictId: input.requestId,
      };
    } else {
      if (
        !rebase &&
        current &&
        (current.baseCommit !== input.baseCommit ||
          current.baseFileHash !== input.baseFileHash)
      )
        return { ok: false, code: "draft_base_changed" };
      const draft: Draft = {
        key,
        source: input.source,
        baseCommit: input.baseCommit,
        baseFileHash: input.baseFileHash,
        revision: input.expectedRevision + 1,
        updatedAt: Date.now(),
        discardedAt: null,
      };
      statements.push(...this.writes(draft));
      result = { ok: true, draft };
    }
    statements.push(
      this.stmt(
        "INSERT INTO editorial_draft_identities VALUES (?,?,?,?,?,?,?,?)",
        input.requestId,
        key,
        payloadHash,
        clientHash,
        result.ok ? "saved" : "conflict",
        result.ok ? result.draft.revision : (result.current?.revision ?? null),
        result.ok ? null : JSON.stringify(result),
      ),
      this.stmt(
        "INSERT INTO editorial_draft_requests VALUES (?,?,?,?,?)",
        input.requestId,
        key,
        payloadHash,
        JSON.stringify(result),
      ),
    );
    statements.push(
      this.stmt(
        "DELETE FROM editorial_draft_requests WHERE store=? AND key=? AND id NOT IN (SELECT id FROM editorial_draft_requests WHERE store=? AND key=? ORDER BY rowid DESC LIMIT 100)",
        key,
        this.store,
        key,
      ),
    );
    await this.db.batch(statements);
    return result;
  }
  async historyPage(
    record: EditorialRecord,
    options: HistoryPageOptions = {},
  ): Promise<HistoryPage> {
    const key = editorialRecordPath(record),
      limit = options.limit ?? 100,
      before = options.beforeRevision ?? Number.MAX_SAFE_INTEGER;
    if (
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isSafeInteger(before) ||
      before < 1
    )
      throw new Error("invalid_history_page");
    const rows = (
      await this.stmt(
        "SELECT snapshot FROM editorial_draft_history WHERE store=? AND key=? AND revision<? ORDER BY revision DESC LIMIT ?",
        key,
        before,
        limit + 1,
      ).all<{ snapshot: string }>()
    ).results;
    const history: Draft[] = [];
    let bytes = 0;
    for (const row of rows) {
      const n = new TextEncoder().encode(row.snapshot).byteLength;
      if (
        history.length === limit ||
        (history.length > 0 && bytes + n > MAX_HISTORY_PAGE_BYTES)
      )
        return { history, nextBeforeRevision: history.at(-1)!.revision };
      history.push(JSON.parse(row.snapshot));
      bytes += n;
    }
    return { history, nextBeforeRevision: null };
  }
  conflict(record: EditorialRecord, id: string) {
    return this.stmt(
      "SELECT source,expectedRevision FROM editorial_draft_conflicts WHERE store=? AND key=? AND id=?",
      editorialRecordPath(record),
      id,
    ).first<{ source: string; expectedRevision: number }>();
  }
  async lifecycle(record: EditorialRecord, revision: number, discard: boolean) {
    const current = await this.get(record);
    if (!current || current.revision !== revision)
      throw new Error("revision_conflict");
    const draft = {
      ...current,
      revision: revision + 1,
      updatedAt: Date.now(),
      discardedAt: discard ? Date.now() : null,
    };
    await this.db.batch(this.writes(draft));
    return draft;
  }
  async updateBase(
    record: EditorialRecord,
    source: string,
    publicationId: string,
    version: number,
  ) {
    const key = editorialRecordPath(record);
    await this.db.batch([
      this.db
        .prepare(
          "UPDATE editorial_drafts SET baseFileHash=? WHERE store=? AND key=? AND NOT EXISTS (SELECT 1 FROM editorial_draft_bases WHERE store=? AND key=? AND inventoryVersion>=?)",
        )
        .bind(gitBlobSha1(source), this.store, key, this.store, key, version),
      this.stmt(
        "INSERT INTO editorial_draft_bases VALUES (?,?,?,?) ON CONFLICT(store,key) DO UPDATE SET publicationId=excluded.publicationId,inventoryVersion=excluded.inventoryVersion WHERE inventoryVersion<excluded.inventoryVersion",
        key,
        publicationId,
        version,
      ),
    ]);
  }
  async status() {
    return this.stmt(
      "SELECT completedAt,counts FROM editorial_draft_imports WHERE store=?",
    ).first<{ completedAt: number; counts: string }>();
  }
}
