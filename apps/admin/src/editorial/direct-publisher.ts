import { createHash } from "node:crypto";
import {
  getDirectReceipt,
  getPublished,
  publishDirect,
  type PublicationDatabase,
} from "@anipotts/content/editorial/direct-publication";
import {
  CONTENT_SCHEMA_VERSION,
  publicationOperationIdSchema,
} from "@anipotts/content/editorial/publication-contract";
import {
  editorialRecordPath,
  editorialRecordSchema,
  parseEditorialSource,
  validateEditorialSource,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import {
  MAX_PUBLICATION_IMAGES,
  MAX_PUBLICATION_MEDIA_BYTES,
  referencedMediaIds,
} from "../lib/editorial-media";
import {
  validatePublishedCandidate,
  bundledEditorialSourceHash,
} from "../lib/editorial-published-base";
import type {
  DirectPublicationStatus,
  StartDirectPublication,
} from "../lib/editorial-publication-status";
import {
  canUnpublish,
  sourceIsPublic,
  unpublishedSource,
} from "../lib/editorial-visibility";
import { drainBounded, readBoundedBytes } from "../lib/bounded-body";
import { HEX64 } from "../lib/patterns";
import type { Draft } from "./draft-store";
import type { EditorialMedia } from "./media-store";

type Receipt = NonNullable<Awaited<ReturnType<typeof getDirectReceipt>>>;
type Intent = Omit<StartDirectPublication, "baselineSource"> & {
  source: string;
  createdAt: number;
};
const actionOf = (intent: Pick<StartDirectPublication, "action">) =>
  intent.action === "unpublish" ? "unpublish" : "publish";
type Row = {
  id: string;
  key: string;
  intent: string;
  phase: "validate" | "commit" | "verify" | "live" | "cancelled";
  version: number;
  attempts: number;
  failures: number;
  dueAt: number;
  lease: string | null;
  leaseUntil: number;
  blocked: string | null;
  inventoryVersion: number | null;
  publishedAt: string | null;
  activatedAt: number | null;
  verifiedAt: number | null;
  superseded: number;
  retryStartedAt: number;
};
export type DirectPublisherDependencies = {
  db: PublicationDatabase;
  media: Pick<R2Bucket, "put" | "get"> | null;
  canActivate?: () => boolean;
  readDraft(record: EditorialRecord): Draft | null;
  readMedia(
    id: string,
  ): Promise<{ metadata: EditorialMedia; bytes: Uint8Array } | null>;
  acknowledge(receipt: Receipt): void;
  validateCandidate?: typeof validatePublishedCandidate;
  transport?: typeof fetch;
  now?: () => number;
};
export type DirectStartResult =
  | { ok: true; publication: DirectPublicationStatus }
  | {
      ok: false;
      code:
        | "invalid_request"
        | "invalid_source"
        | "revision_conflict"
        | "idempotency_key_reused"
        | "unsupported_visibility_change"
        | "unpublish_unsupported"
        | "already_hidden"
        | "baseline_changed"
        | "publication_in_progress";
      publication?: DirectPublicationStatus;
    };
const leaseMs = 60_000;
const prepareWindow = 30 * 60_000;
const verifyWindow = 24 * 60 * 60_000;
const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const terminal = (row: Row) =>
  row.phase === "live" || row.phase === "cancelled";
const sameInput = (
  left: StartDirectPublication,
  right: StartDirectPublication,
) =>
  actionOf(left) === actionOf(right) &&
  left.record.kind === right.record.kind &&
  left.record.id === right.record.id &&
  left.expectedRevision === right.expectedRevision &&
  left.reviewedSourceSha256 === right.reviewedSourceSha256 &&
  left.expectedPublicationId === right.expectedPublicationId &&
  left.expectedBaselineSha256 === right.expectedBaselineSha256;

/** Durable per-record publishing. Private intents stay in the editorial object;
 * only approved, validated snapshots cross into the dedicated publication DB. */
export class DirectPublisher {
  constructor(
    private storage: DurableObjectStorage,
    private deps: DirectPublisherDependencies | null,
  ) {
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS direct_publication_intents (
      id TEXT PRIMARY KEY, key TEXT NOT NULL, intent TEXT NOT NULL,
      phase TEXT NOT NULL CHECK(phase IN ('validate','commit','verify','live','cancelled')),
      version INTEGER NOT NULL, attempts INTEGER NOT NULL, failures INTEGER NOT NULL,
      dueAt INTEGER NOT NULL, lease TEXT, leaseUntil INTEGER NOT NULL, blocked TEXT,
      inventoryVersion INTEGER, publishedAt TEXT, activatedAt INTEGER, verifiedAt INTEGER,
      retryStartedAt INTEGER NOT NULL DEFAULT 0, superseded INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS direct_publication_record ON direct_publication_intents(key);
    CREATE INDEX IF NOT EXISTS direct_publication_due ON direct_publication_intents(dueAt,leaseUntil) WHERE phase NOT IN ('live','cancelled');
    CREATE TRIGGER IF NOT EXISTS direct_publication_intents_immutable
      BEFORE UPDATE OF id,key,intent ON direct_publication_intents
      BEGIN SELECT RAISE(ABORT, 'publication intent is immutable'); END;`);
  }
  static readStatus(
    storage: DurableObjectStorage,
    record: EditorialRecord,
    id?: string,
  ) {
    return new DirectPublisher(storage, null).read(record, id);
  }
  private get dependencies(): DirectPublisherDependencies {
    if (!this.deps) throw new Error("publisher_not_configured");
    return this.deps;
  }
  private now() {
    return this.deps?.now?.() ?? Date.now();
  }
  private get(id: string): Row | null {
    return (
      this.storage.sql
        .exec<Row>("SELECT * FROM direct_publication_intents WHERE id = ?", id)
        .toArray()[0] ?? null
    );
  }
  private status(row: Row, alarmAt: number | null): DirectPublicationStatus {
    const intent = JSON.parse(row.intent) as Intent;
    const pending = this.storage.sql
      .exec<{ count: number }>(
        "SELECT COUNT(*) AS count FROM direct_publication_intents WHERE key = ? AND phase NOT IN ('live','cancelled')",
        row.key,
      )
      .one().count;
    return {
      mode: "direct",
      action: actionOf(intent),
      id: row.id,
      revision: intent.expectedRevision,
      phase: row.phase,
      version: row.version,
      attempts: row.attempts,
      dueAt: row.dueAt,
      lease: row.lease ? "active" : null,
      leaseUntil: row.leaseUntil,
      blocked: row.blocked,
      checkpoint: {},
      canCancel: row.phase === "validate" && row.lease === null,
      queue: { pending, position: null, head: null, alarmAt },
      publicationId: row.activatedAt === null ? null : row.id,
      sourceSha256: intent.reviewedSourceSha256,
      baselineSha256: intent.expectedBaselineSha256,
      inventoryVersion: row.activatedAt === null ? null : row.inventoryVersion,
      verifiedAt: row.verifiedAt,
      superseded: row.superseded === 1,
    };
  }
  async read(
    record: EditorialRecord,
    id?: string,
  ): Promise<DirectPublicationStatus | null> {
    let key: string;
    try {
      key = editorialRecordPath(record);
    } catch {
      return null;
    }
    const alarmAt = await this.storage.getAlarm();
    const row = id
      ? this.get(id)
      : this.storage.sql
          .exec<Row>(
            "SELECT * FROM direct_publication_intents WHERE key = ? ORDER BY rowid DESC LIMIT 1",
            key,
          )
          .toArray()[0];
    return row && row.key === key ? this.status(row, alarmAt) : null;
  }
  async start(input: StartDirectPublication): Promise<DirectStartResult> {
    if (
      !editorialRecordSchema.safeParse(input.record).success ||
      !publicationOperationIdSchema.safeParse(input.operationId).success ||
      !publicationOperationIdSchema
        .nullable()
        .safeParse(input.expectedPublicationId).success ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1 ||
      !HEX64.test(input.reviewedSourceSha256) ||
      !HEX64.test(input.expectedBaselineSha256)
    )
      return { ok: false, code: "invalid_request" };
    // Persist the wake before accepting intent. A crash leaves either an empty
    // harmless alarm, or approved work that can continue without its browser.
    await this.storage.setAlarm(this.now() + 1000);
    const result = this.storage.transactionSync(() => {
      const previous = this.get(input.operationId);
      if (previous)
        return sameInput(JSON.parse(previous.intent) as Intent, input)
          ? { ok: true as const }
          : { ok: false as const, code: "idempotency_key_reused" as const };
      const existing = this.storage.sql
        .exec<{ id: string }>(
          "SELECT id FROM direct_publication_intents WHERE key=? AND phase IN ('validate','commit') ORDER BY rowid LIMIT 1",
          editorialRecordPath(input.record),
        )
        .toArray()[0];
      if (existing)
        return {
          ok: false as const,
          code: "publication_in_progress" as const,
          existingId: existing.id,
        };
      const approved =
        actionOf(input) === "unpublish"
          ? this.hiddenRevision(input)
          : this.draftRevision(input);
      if (typeof approved !== "string")
        return { ok: false as const, code: approved.code };
      const createdAt = this.now();
      // The baseline source itself stays out of the intent: its hash is
      // already bound, and the hidden revision is derived from it here.
      const intent: Intent = {
        record: input.record,
        operationId: input.operationId,
        expectedRevision: input.expectedRevision,
        reviewedSourceSha256: input.reviewedSourceSha256,
        expectedPublicationId: input.expectedPublicationId,
        expectedBaselineSha256: input.expectedBaselineSha256,
        action: actionOf(input),
        source: approved,
        createdAt,
      };
      this.storage.sql.exec(
        `INSERT INTO direct_publication_intents (id,key,intent,phase,version,attempts,failures,dueAt,lease,leaseUntil,blocked)
         VALUES (?,?,?,'validate',0,0,0,?,NULL,0,NULL)`,
        input.operationId,
        editorialRecordPath(input.record),
        JSON.stringify(intent),
        createdAt,
      );
      return { ok: true as const };
    });
    if (result.ok)
      return {
        ok: true,
        publication: (await this.read(input.record, input.operationId))!,
      };
    if ("existingId" in result)
      return {
        ok: false,
        code: result.code,
        publication: (await this.read(input.record, result.existingId))!,
      };
    return result;
  }
  /** The exact reviewed private draft, which must stay publicly visible. */
  private draftRevision(input: StartDirectPublication) {
    const draft = this.dependencies.readDraft(input.record);
    if (
      !draft ||
      draft.discardedAt !== null ||
      draft.revision !== input.expectedRevision ||
      hash(draft.source) !== input.reviewedSourceSha256
    )
      return { code: "revision_conflict" as const };
    try {
      if (!validateEditorialSource(input.record, draft.source).success)
        return { code: "invalid_source" as const };
    } catch {
      return { code: "invalid_source" as const };
    }
    const data = parseEditorialSource(draft.source).data as Record<
      string,
      unknown
    >;
    // Taking a piece off the site is its own reviewed action (unpublish),
    // built from the public source. Private draft text never becomes a
    // hidden publication, and scheduling still has no reader support.
    if (
      (input.record.kind === "writing" && data.status !== "published") ||
      (input.record.kind === "work" &&
        !["featured", "listed"].includes(String(data.public_state))) ||
      (input.record.kind === "page" && input.record.id === "newsletter")
    )
      return { code: "unsupported_visibility_change" as const };
    return draft.source;
  }
  /** The current public source with visibility switched off. The owner
   * reviewed its hash against the same baseline the server read, so the
   * approval names one exact hidden revision of one exact public base. */
  private hiddenRevision(input: StartDirectPublication) {
    if (!canUnpublish(input.record))
      return { code: "unpublish_unsupported" as const };
    const base = input.baselineSource;
    if (typeof base !== "string" || hash(base) !== input.expectedBaselineSha256)
      return { code: "baseline_changed" as const };
    if (!sourceIsPublic(input.record, base))
      return { code: "already_hidden" as const };
    let hidden: string;
    try {
      hidden = unpublishedSource(input.record, base);
      if (!validateEditorialSource(input.record, hidden).success)
        return { code: "invalid_source" as const };
    } catch {
      return { code: "invalid_source" as const };
    }
    if (
      sourceIsPublic(input.record, hidden) ||
      hash(hidden) !== input.reviewedSourceSha256
    )
      return { code: "revision_conflict" as const };
    return hidden;
  }
  async retry(record: EditorialRecord, id: string, version: number) {
    await this.storage.setAlarm(this.now() + 1000);
    return this.storage.transactionSync(() => {
      const row = this.get(id);
      if (
        !row ||
        row.key !== editorialRecordPath(record) ||
        row.version !== version ||
        !row.blocked ||
        row.lease ||
        terminal(row)
      )
        return false;
      this.storage.sql.exec(
        "UPDATE direct_publication_intents SET blocked = NULL, failures = 0, dueAt = ?, retryStartedAt = ?, version = version + 1 WHERE id = ?",
        this.now(),
        this.now(),
        id,
      );
      return true;
    });
  }
  async cancel(record: EditorialRecord, id: string, version: number) {
    // Only preparation is cancellable. Once an activation might be in flight,
    // reconcile its durable receipt rather than claim it did not publish.
    await this.storage.setAlarm(this.now() + 1000);
    return this.storage.transactionSync(() => {
      const row = this.get(id);
      if (
        !row ||
        row.key !== editorialRecordPath(record) ||
        row.version !== version ||
        row.phase !== "validate" ||
        row.lease !== null
      )
        return false;
      this.storage.sql.exec(
        "UPDATE direct_publication_intents SET phase = 'cancelled', blocked = NULL, version = version + 1 WHERE id = ?",
        id,
      );
      return true;
    });
  }
  private eligibleSql = `phase NOT IN ('live','cancelled') AND (blocked IS NULL OR blocked = 'publishing_disabled') AND NOT EXISTS (
    SELECT 1 FROM direct_publication_intents AS earlier WHERE direct_publication_intents.key = earlier.key
    AND earlier.rowid < direct_publication_intents.rowid AND earlier.phase IN ('validate','commit'))`;
  private nextWake() {
    const row = this.storage.sql
      .exec<{ due: number | null }>(
        `SELECT MIN(MAX(dueAt,leaseUntil)) AS due FROM direct_publication_intents WHERE ${this.eligibleSql}`,
      )
      .one();
    return row.due === null ? null : Math.max(this.now() + 1000, row.due);
  }
  private claim(): Row | null {
    return this.storage.transactionSync(() => {
      const row = this.storage.sql
        .exec<Row>(
          `SELECT * FROM direct_publication_intents WHERE ${this.eligibleSql} AND dueAt <= ? AND leaseUntil <= ? ORDER BY dueAt,rowid LIMIT 1`,
          this.now(),
          this.now(),
        )
        .toArray()[0];
      if (!row) return null;
      this.storage.sql.exec(
        "UPDATE direct_publication_intents SET lease = ?, leaseUntil = ?, version = version + 1, attempts = attempts + 1 WHERE id = ?",
        crypto.randomUUID(),
        this.now() + leaseMs,
        row.id,
      );
      return this.get(row.id);
    });
  }
  private settle(
    claim: Row,
    changes: Partial<
      Pick<
        Row,
        | "phase"
        | "blocked"
        | "dueAt"
        | "failures"
        | "inventoryVersion"
        | "publishedAt"
        | "activatedAt"
        | "verifiedAt"
        | "superseded"
      >
    >,
  ) {
    return this.storage.transactionSync(() => {
      const current = this.get(claim.id);
      if (
        !current ||
        current.version !== claim.version ||
        current.lease !== claim.lease ||
        current.leaseUntil <= this.now()
      )
        return false;
      const row = { ...current, ...changes };
      this.storage.sql.exec(
        `UPDATE direct_publication_intents SET phase=?,blocked=?,dueAt=?,failures=?,inventoryVersion=?,publishedAt=?,activatedAt=?,verifiedAt=?,superseded=?,lease=NULL,leaseUntil=0,version=version+1 WHERE id=?`,
        row.phase,
        row.blocked,
        row.dueAt,
        row.failures,
        row.inventoryVersion,
        row.publishedAt,
        row.activatedAt,
        row.verifiedAt,
        row.superseded,
        row.id,
      );
      return true;
    });
  }
  async alarm() {
    const claim = this.claim();
    if (!claim) {
      const next = this.nextWake();
      if (next !== null) await this.storage.setAlarm(next);
      return;
    }
    await this.storage.setAlarm(claim.leaseUntil);
    try {
      await this.advance(claim);
    } catch {
      const intent = JSON.parse(claim.intent) as Intent;
      const window = claim.activatedAt === null ? prepareWindow : verifyWindow;
      const started = Math.max(
        claim.retryStartedAt,
        claim.activatedAt ?? intent.createdAt,
      );
      const failures = claim.failures + 1;
      const expired = this.now() - started >= window;
      this.settle(claim, {
        failures,
        blocked: expired
          ? claim.activatedAt === null
            ? "publication_retry_required"
            : "verification_incomplete"
          : null,
        dueAt:
          this.now() + Math.min(300_000, 5000 * 2 ** Math.min(failures - 1, 6)),
      });
    }
    const next = this.nextWake();
    if (next !== null) await this.storage.setAlarm(next);
  }
  private matchesReceipt(intent: Intent, receipt: Receipt) {
    return (
      receipt.record.kind === intent.record.kind &&
      receipt.record.id === intent.record.id &&
      receipt.revision === intent.expectedRevision &&
      receipt.sourceSha256 === intent.reviewedSourceSha256 &&
      receipt.expectedPublicationId === intent.expectedPublicationId &&
      receipt.contentSchemaVersion === CONTENT_SCHEMA_VERSION
    );
  }
  private async reconcile(claim: Row, intent: Intent, receipt: Receipt) {
    if (!this.matchesReceipt(intent, receipt)) {
      this.settle(claim, { blocked: "idempotency_conflict" });
      return;
    }
    // Acknowledgment is idempotent and monotonic by D1 inventory version. It
    // updates the private baseline only, never a newer authored source/revision.
    this.dependencies.acknowledge(receipt);
    const version = receipt.expectedInventoryVersion + 1;
    const current = await getPublished(this.dependencies.db, intent.record);
    if (current?.publicationId !== receipt.publicationId) {
      this.settle(claim, {
        phase: "live",
        blocked: null,
        inventoryVersion: version,
        publishedAt: receipt.publishedAt,
        activatedAt: claim.activatedAt ?? this.now(),
        superseded: 1,
      });
      return;
    }
    if (claim.phase !== "verify") {
      this.settle(claim, {
        phase: "verify",
        blocked: null,
        failures: 0,
        dueAt: this.now(),
        inventoryVersion: version,
        publishedAt: receipt.publishedAt,
        activatedAt: claim.activatedAt ?? this.now(),
      });
      return;
    }
    const verified = await this.verify(intent, receipt, version);
    if (verified)
      this.settle(claim, {
        phase: "live",
        blocked: null,
        failures: 0,
        verifiedAt: this.now(),
      });
    else if (
      this.now() -
        Math.max(claim.retryStartedAt, claim.activatedAt ?? this.now()) >=
      verifyWindow
    )
      this.settle(claim, { blocked: "verification_incomplete" });
    else
      this.settle(claim, {
        dueAt:
          this.now() +
          Math.min(300_000, 5000 * 2 ** Math.min(claim.failures, 6)),
        failures: claim.failures + 1,
      });
  }
  private async publicEvidence(
    record?: EditorialRecord,
  ): Promise<Record<string, unknown> | null> {
    const url = new URL("https://anipotts.com/api/content-version");
    if (record) {
      url.searchParams.set("kind", record.kind);
      url.searchParams.set("id", record.id);
    }
    const response = await (this.dependencies.transport ?? fetch)(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return null;
    }
    try {
      const bytes = await readBoundedBytes(response.body, 4096);
      if (!bytes) return null;
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  private async verify(intent: Intent, receipt: Receipt, version: number) {
    const value = await this.publicEvidence(intent.record);
    const unpublish = actionOf(intent) === "unpublish";
    if (
      !value ||
      value.runtime !== 1 ||
      value.contentSchemaVersion !== CONTENT_SCHEMA_VERSION ||
      !Number.isSafeInteger(value.inventoryVersion) ||
      Number(value.inventoryVersion) < version
    )
      return false;
    // The reader names the active publication only while it is visible. A
    // hidden one reports visible: false; reconcile has already confirmed from
    // D1 that this receipt is the active pointer at this inventory.
    if (
      unpublish
        ? value.visible !== false
        : value.publicationId !== receipt.publicationId ||
          value.sourceSha256 !== receipt.sourceSha256
    )
      return false;
    const data = parseEditorialSource(intent.source).data as Record<
      string,
      unknown
    >;
    const rawSlug = String(data.slug ?? intent.record.id);
    const slug = encodeURIComponent(rawSlug);
    const section = intent.record.kind === "work" ? "work" : "writing";
    // An unpublished piece is gone when its detail route and social card 404
    // at this inventory and no discovery surface still names its route.
    const escaped = rawSlug.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const named = new RegExp(
      `/${section}/${escaped}(?![A-Za-z0-9_-])|"slug":"${escaped}"`,
      "u",
    );
    const routes: Array<{ path: string; status: 200 | 404; absent?: RegExp }> =
      unpublish
        ? intent.record.kind === "writing"
          ? [
              { path: `/writing/${slug}`, status: 404 },
              { path: `/social/writing-${slug}.png`, status: 404 },
              ...[
                "/writing",
                "/feed.xml",
                "/search-index.json",
                "/sitemap.xml",
                "/",
              ].map((path) => ({ path, status: 200 as const, absent: named })),
            ]
          : [
              { path: `/work/${slug}`, status: 404 },
              ...["/work", "/", "/sitemap.xml"].map((path) => ({
                path,
                status: 200 as const,
                absent: named,
              })),
            ]
        : (intent.record.kind === "writing"
            ? [
                `/writing/${slug}`,
                "/writing",
                "/feed.xml",
                "/search-index.json",
                "/sitemap.xml",
                "/",
              ]
            : intent.record.kind === "work"
              ? [`/work/${slug}`, "/work", "/", "/sitemap.xml"]
              : [
                  intent.record.id === "home" ? "/" : `/${intent.record.id}`,
                  "/sitemap.xml",
                ]
          ).map((path) => ({ path, status: 200 as const }));
    const transport = this.dependencies.transport ?? fetch;
    // Two in flight at most. Read bounded bodies to catch streaming failures.
    // A body is searched only for the unpublished route, then discarded; page
    // content is never retained or reported.
    for (let offset = 0; offset < routes.length; offset += 2) {
      const results = await Promise.all(
        routes
          .slice(offset, offset + 2)
          .map(async ({ path, status, absent }) => {
            const response = await transport(
              new URL(path, "https://anipotts.com"),
              {
                redirect: "manual",
                cache: "no-store",
                signal: AbortSignal.timeout(5000),
              },
            );
            // The reader's validator names the inventory its body came from, so
            // a revalidating or colo-cached copy of an older version fails here
            // even if a header were rewritten. Compression may weaken it (W/).
            // A 404 is no-store and carries the version header without one.
            const etag = response.headers.get("ETag");
            if (
              response.status !== status ||
              response.headers.get("X-Content-Version") !==
                String(value.inventoryVersion) ||
              (status === 200 &&
                etag !== null &&
                !new RegExp(
                  `^(?:W/)?"cms\\d+-v${Number(value.inventoryVersion)}-[0-9a-f]+"$`,
                  "u",
                ).test(etag)) ||
              (status === 200 && !response.body)
            ) {
              await response.body?.cancel();
              return false;
            }
            if (!response.body) return true;
            const decoder = new TextDecoder();
            let text = "";
            const complete = await drainBounded(
              response.body,
              2 * 1024 * 1024,
              (chunk) => {
                if (absent) text += decoder.decode(chunk, { stream: true });
              },
            ).catch(() => false);
            return (
              complete && (!absent || !absent.test(text + decoder.decode()))
            );
          }),
      );
      if (results.some((ok) => !ok)) return false;
    }
    if (unpublish) return true;
    let totalMediaBytes = 0;
    const mediaIds = referencedMediaIds(intent.source);
    const verifyMedia = async (id: string) => {
      const response = await transport(
        new URL(`/images/editorial/${id}`, "https://anipotts.com"),
        {
          redirect: "manual",
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        return false;
      }
      const digest = createHash("sha256");
      const reader = response.body.getReader();
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          totalMediaBytes += chunk.value.byteLength;
          if (totalMediaBytes > MAX_PUBLICATION_MEDIA_BYTES) {
            await reader.cancel();
            return false;
          }
          digest.update(chunk.value);
        }
      } catch {
        return false;
      } finally {
        reader.releaseLock();
      }
      return digest.digest("hex") === id.split(".")[0];
    };
    for (let offset = 0; offset < mediaIds.length; offset += 2) {
      if (
        (
          await Promise.all(mediaIds.slice(offset, offset + 2).map(verifyMedia))
        ).some((valid) => !valid)
      )
        return false;
    }
    return true;
  }
  private async advance(claim: Row) {
    const intent = JSON.parse(claim.intent) as Intent;
    // This is the first external read on every attempt. Lost D1 responses never
    // turn into a blind second publication or a false "failed to publish" claim.
    const receipt = await getDirectReceipt(this.dependencies.db, claim.id);
    if (receipt) {
      await this.reconcile(claim, intent, receipt);
      return;
    }
    if (
      this.dependencies.canActivate?.() === false ||
      !this.dependencies.media
    ) {
      this.settle(claim, {
        blocked: "publishing_disabled",
        dueAt: this.now() + 60_000,
      });
      return;
    }
    if (
      claim.activatedAt === null &&
      this.now() - Math.max(claim.retryStartedAt, intent.createdAt) >=
        prepareWindow
    ) {
      this.settle(claim, { blocked: "publication_retry_required" });
      return;
    }
    if (claim.phase === "verify") {
      this.settle(claim, { blocked: "publication_receipt_missing" });
      return;
    }
    if (claim.phase === "commit") {
      let reader: Record<string, unknown> | null = null;
      try {
        reader = await this.publicEvidence();
      } catch {
        /* bounded readiness below */
      }
      if (
        !reader ||
        reader.runtime !== 1 ||
        reader.contentSchemaVersion !== CONTENT_SCHEMA_VERSION ||
        !Number.isSafeInteger(reader.inventoryVersion)
      ) {
        this.settle(claim, { blocked: "public_reader_not_ready" });
        return;
      }
      if (reader.bundledSourceSha256 !== (await bundledEditorialSourceHash())) {
        this.settle(claim, { blocked: "public_baseline_mismatch" });
        return;
      }
      if (reader.inventoryVersion !== claim.inventoryVersion) {
        this.settle(claim, { phase: "validate", dueAt: this.now() + 5000 });
        return;
      }
      const result = await publishDirect(this.dependencies.db, {
        contentSchemaVersion: CONTENT_SCHEMA_VERSION,
        record: intent.record,
        source: intent.source,
        revision: intent.expectedRevision,
        operationId: intent.operationId,
        expectedPublicationId: intent.expectedPublicationId,
        expectedInventoryVersion: claim.inventoryVersion!,
        publishedAt: claim.publishedAt!,
      });
      if (result.status === "conflict") {
        this.settle(claim, {
          phase: "validate",
          dueAt: this.now(),
          failures: 0,
        });
        return;
      }
      if (result.status === "idempotency_conflict") {
        this.settle(claim, { blocked: "idempotency_conflict" });
        return;
      }
      const activated = await getDirectReceipt(this.dependencies.db, claim.id);
      if (!activated) throw new Error("activation_unconfirmed");
      await this.reconcile(claim, intent, activated);
      return;
    }
    const candidate = await (
      this.dependencies.validateCandidate ?? validatePublishedCandidate
    )(this.dependencies.db, intent.record, intent.source);
    if (
      candidate.baseline.publicationId !== intent.expectedPublicationId ||
      candidate.baseline.sourceSha256 !== intent.expectedBaselineSha256
    ) {
      this.settle(claim, { blocked: "publication_base_changed" });
      return;
    }
    const unpublish = actionOf(intent) === "unpublish";
    if (
      unpublish &&
      (!canUnpublish(intent.record) ||
        unpublishedSource(intent.record, candidate.baseline.source) !==
          intent.source)
    ) {
      this.settle(claim, { blocked: "publication_base_changed" });
      return;
    }
    if (
      intent.record.kind !== "page" &&
      candidate.baseline.baseFileHash !== null
    ) {
      const baseData = parseEditorialSource(candidate.baseline.source)
        .data as Record<string, unknown>;
      const nextData = parseEditorialSource(intent.source).data as Record<
        string,
        unknown
      >;
      if (
        (baseData.slug ?? intent.record.id) !==
        (nextData.slug ?? intent.record.id)
      ) {
        this.settle(claim, { blocked: "unsupported_slug_change" });
        return;
      }
    }
    if (!candidate.valid) {
      // Hiding a piece another record still points at (the homepage writing
      // selection) would leave the site inconsistent, so it waits for that
      // record to be published without it first.
      this.settle(claim, {
        blocked: unpublish ? "unpublish_breaks_reference" : "invalid_snapshot",
      });
      return;
    }
    // A hidden revision references only images its public revision already
    // staged, and the reader stops serving them once nothing visible does.
    const ids = unpublish ? [] : referencedMediaIds(intent.source);
    if (ids.length > MAX_PUBLICATION_IMAGES) {
      this.settle(claim, { blocked: "too_many_images" });
      return;
    }
    let total = 0;
    for (const id of ids) {
      const media = await this.dependencies.readMedia(id);
      if (!media) {
        this.settle(claim, { blocked: "publication_image_missing" });
        return;
      }
      total += media.bytes.byteLength;
      if (total > MAX_PUBLICATION_MEDIA_BYTES) {
        this.settle(claim, { blocked: "publication_images_too_large" });
        return;
      }
      if (
        !media.bytes.length ||
        media.metadata.id !== id ||
        media.metadata.size !== media.bytes.length ||
        hash(media.bytes) !== id.split(".")[0]
      ) {
        this.settle(claim, { blocked: "publication_image_corrupt" });
        return;
      }
      await this.dependencies.media.put(id, media.bytes, {
        sha256: hash(media.bytes),
        httpMetadata: { contentType: media.metadata.type },
      });
      const copied = await this.dependencies.media.get(id);
      if (
        !copied ||
        copied.size !== media.bytes.length ||
        hash(new Uint8Array(await copied.arrayBuffer())) !== hash(media.bytes)
      ) {
        this.settle(claim, { blocked: "publication_image_copy_failed" });
        return;
      }
    }
    this.settle(claim, {
      phase: "commit",
      blocked: null,
      failures: 0,
      inventoryVersion: candidate.inventoryVersion,
      publishedAt: claim.publishedAt ?? new Date(this.now()).toISOString(),
      dueAt: this.now(),
    });
  }
}
