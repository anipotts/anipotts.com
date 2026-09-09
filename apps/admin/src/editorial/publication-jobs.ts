export type PublishPhase =
  | "validate"
  | "commit"
  | "branch"
  | "pr"
  | "checks"
  | "deploy"
  | "verify"
  | "live"
  | "cancelled";
export type PublishJob = {
  id: string;
  phase: PublishPhase;
  version: number;
  attempts: number;
  dueAt: number;
  lease: string | null;
  leaseUntil: number;
  blocked: string | null;
  checkpoint: Record<string, string>;
};
export type PublishOutcome = {
  next?: PublishPhase;
  checkpoint?: Record<string, string>;
  retryAt?: number;
  blocked?: string;
};
const phases: PublishPhase[] = [
  "validate",
  "commit",
  "branch",
  "pr",
  "checks",
  "deploy",
  "verify",
  "live",
];
const leaseMs = 60_000;

/** Private coordinator storage inside the site's existing SQLite object.
 * Caller performs external work outside the transaction, then presents its lease.
 */
export class PublicationJobs {
  constructor(private readonly storage: DurableObjectStorage) {
    storage.sql.exec(`CREATE TABLE IF NOT EXISTS publication_jobs (
      id TEXT PRIMARY KEY, phase TEXT NOT NULL, version INTEGER NOT NULL,
      attempts INTEGER NOT NULL, dueAt INTEGER NOT NULL, lease TEXT,
      leaseUntil INTEGER NOT NULL, blocked TEXT, checkpoint TEXT NOT NULL
    )`);
  }
  enqueue(id: string, now: number): PublishJob {
    this.storage.sql.exec(
      `INSERT OR IGNORE INTO publication_jobs
      (id,phase,version,attempts,dueAt,lease,leaseUntil,blocked,checkpoint)
      VALUES (?, 'validate', 0, 0, ?, NULL, 0, NULL, '{}')`,
      id,
      now,
    );
    return this.get(id)!;
  }
  get(id: string): PublishJob | null {
    const row = this.storage.sql
      .exec<Omit<PublishJob, "checkpoint"> & { checkpoint: string }>(
        "SELECT * FROM publication_jobs WHERE id = ?",
        id,
      )
      .toArray()[0];
    return row ? { ...row, checkpoint: JSON.parse(row.checkpoint) } : null;
  }
  nextWake(now: number): number | null {
    const row = this.storage.sql
      .exec<{ id: string }>(
        "SELECT id FROM publication_jobs WHERE phase NOT IN ('live', 'cancelled') ORDER BY rowid LIMIT 1",
      )
      .toArray()[0];
    const job = row ? this.get(row.id) : null;
    return !job || job.blocked
      ? null
      : Math.max(now + 1000, job.dueAt, job.leaseUntil);
  }
  /** Explicit owner retry only. Keep the authorized snapshot and provider
   * checkpoints intact; the resumed stage must recheck its gates. */
  retry(id: string, expectedVersion: number, now: number): boolean {
    if (!Number.isSafeInteger(now) || now < 0)
      throw new Error("invalid_retry_time");
    return this.storage.transactionSync(() => {
      const job = this.get(id);
      if (
        !job ||
        job.version !== expectedVersion ||
        !job.blocked ||
        job.phase === "live" ||
        job.phase === "cancelled" ||
        job.lease !== null
      )
        return false;
      this.storage.sql.exec(
        "UPDATE publication_jobs SET blocked = NULL, dueAt = ?, version = version + 1 WHERE id = ?",
        now,
        id,
      );
      return true;
    });
  }
  requestCancel(id: string, expectedVersion: number, now: number): boolean {
    return this.storage.transactionSync(() => {
      const job = this.get(id);
      if (
        !job ||
        job.version !== expectedVersion ||
        job.lease !== null ||
        !["validate", "commit", "branch", "pr", "checks"].includes(job.phase)
      )
        return false;
      this.storage.sql.exec(
        "UPDATE publication_jobs SET checkpoint = ?, blocked = NULL, dueAt = ?, version = version + 1 WHERE id = ?",
        JSON.stringify({ ...job.checkpoint, cancelRequested: "true" }),
        now,
        id,
      );
      return true;
    });
  }
  claim(now: number): PublishJob | null {
    return this.storage.transactionSync(() => {
      // Keep the first unfinished publication in charge, even while blocked or
      // backing off. A later publication must not overtake an ambiguous merge.
      const row = this.storage.sql
        .exec<{ id: string }>(
          "SELECT id FROM publication_jobs WHERE phase NOT IN ('live', 'cancelled') ORDER BY rowid LIMIT 1",
        )
        .toArray()[0];
      const job = row ? this.get(row.id) : null;
      if (!job || job.blocked || job.dueAt > now || job.leaseUntil > now)
        return null;
      this.storage.sql.exec(
        "UPDATE publication_jobs SET lease = ?, leaseUntil = ?, version = version + 1, attempts = attempts + 1 WHERE id = ?",
        crypto.randomUUID(),
        now + leaseMs,
        job.id,
      );
      return this.get(job.id);
    });
  }
  settle(claim: PublishJob, outcome: PublishOutcome, now: number): boolean {
    return this.storage.transactionSync(() => {
      const job = this.get(claim.id);
      if (
        !job ||
        !job.lease ||
        job.lease !== claim.lease ||
        job.version !== claim.version ||
        job.leaseUntil <= now
      )
        return false;
      const next = outcome.next ?? job.phase;
      if (
        next !== job.phase &&
        phases.indexOf(next) !== phases.indexOf(job.phase) + 1 &&
        !(
          job.checkpoint.cancelRequested === "true" &&
          ["validate", "commit", "branch", "pr", "checks"].includes(
            job.phase,
          ) &&
          (next === "cancelled" ||
            (next === "deploy" &&
              /^[a-f0-9]{40}$/.test(outcome.checkpoint?.mergeCommit ?? "")))
        )
      )
        throw new Error("invalid_publication_transition");
      if (outcome.blocked && !/^[a-z_]{1,64}$/.test(outcome.blocked))
        throw new Error("invalid_error_code");
      const dueAt = outcome.retryAt ?? now;
      if (!Number.isSafeInteger(dueAt) || dueAt < now)
        throw new Error("invalid_retry_time");
      const checkpoint = { ...job.checkpoint, ...outcome.checkpoint };
      // Persist provider references only; never tokens, draft source or responses.
      if (
        Object.entries(checkpoint).some(
          ([key, value]) =>
            ![
              "cancelRequested",
              "baseHead",
              "baseTree",
              "commit",
              "prNumber",
              "prNodeId",
              "mergeCommit",
              "deployRun",
            ].includes(key) || !/^[A-Za-z0-9_=-]{1,200}$/.test(value),
        )
      )
        throw new Error("invalid_checkpoint");
      this.storage.sql.exec(
        "UPDATE publication_jobs SET phase = ?, checkpoint = ?, dueAt = ?, blocked = ?, lease = NULL, leaseUntil = 0, version = version + 1 WHERE id = ?",
        next,
        JSON.stringify(checkpoint),
        dueAt,
        outcome.blocked ?? null,
        job.id,
      );
      return true;
    });
  }
}
