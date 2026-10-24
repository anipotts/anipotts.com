import type { PublicationDatabase } from "./direct-publication.js";

/** Additive migration enrollment, never a caller-supplied quiescence claim.
 * Legacy databases remain writable but are ineligible for coherent capture. */
export async function recoveryEnrolled(
  db: PublicationDatabase,
): Promise<boolean> {
  return Boolean(
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='editorial_recovery_control'",
      )
      .first(),
  );
}

export type RecoveryWriter = { token: string; generation: number };
export async function acquireRecoveryWriter(
  db: PublicationDatabase,
  kind: string,
): Promise<RecoveryWriter | null> {
  if (!(await recoveryEnrolled(db))) return null;
  const token = crypto.randomUUID();
  const result = await db.batch<{ token: string; generation: number }>([
    db
      .prepare(
        "INSERT INTO editorial_recovery_writers (token,generation,kind,state) SELECT ?,generation,?,'active' FROM editorial_recovery_control WHERE singleton=1 AND phase='open'",
      )
      .bind(token, kind),
    db
      .prepare(
        "SELECT token,generation FROM editorial_recovery_writers WHERE token=?",
      )
      .bind(token),
  ]);
  if (result.some((row) => !row.success) || !result[1]?.results[0])
    throw new Error("recovery_write_fenced");
  return result[1].results[0];
}

/** Failed/ambiguous external writes deliberately retain their durable record.
 * No TTL, retry counter, or process restart can manufacture completion. */
export async function withRecoveryWriter<T>(
  db: PublicationDatabase,
  kind: string,
  work: () => Promise<T>,
): Promise<T> {
  const writer = await acquireRecoveryWriter(db, kind);
  try {
    const value = await work();
    if (writer) {
      const result = await db.batch([
        db
          .prepare(
            "DELETE FROM editorial_recovery_writers WHERE token=? AND generation=?",
          )
          .bind(writer.token, writer.generation),
      ]);
      if (result.some((row) => !row.success) || result[0]?.meta?.changes !== 1)
        throw new Error("recovery_writer_completion_unconfirmed");
    }
    return value;
  } catch (error) {
    // A failed mutation response can mean the remote write committed. Keep the
    // row until separately reconciled using provider evidence, never a timeout.
    throw error;
  }
}

export async function freezeRecoveryDatabase(
  db: PublicationDatabase,
  captureId: string,
): Promise<number> {
  if (!(await recoveryEnrolled(db)))
    throw new Error("recovery_fence_not_installed");
  const result = await db.batch<{
    generation: number;
    phase: string;
    capture_id: string;
    pending: number;
  }>([
    db
      .prepare(
        "UPDATE editorial_recovery_control SET phase='draining',capture_id=?,generation=generation+1 WHERE singleton=1 AND phase='open'",
      )
      .bind(captureId),
    db.prepare(
      "SELECT generation,phase,capture_id,(SELECT count(*) FROM editorial_recovery_writers) AS pending FROM editorial_recovery_control WHERE singleton=1",
    ),
  ]);
  const state = result[1]?.results[0];
  if (
    result.some((row) => !row.success) ||
    result[0]?.meta?.changes !== 1 ||
    !state ||
    state.capture_id !== captureId ||
    state.phase !== "draining"
  )
    throw new Error("recovery_fence_conflict");
  if (state.pending !== 0)
    throw new Error("recovery_external_writers_unresolved");
  return state.generation;
}

export async function assertRecoveryDatabaseFrozen(
  db: PublicationDatabase,
  captureId: string,
  generation: number,
): Promise<void> {
  const state = await db
    .prepare(
      "SELECT phase,capture_id,generation,(SELECT count(*) FROM editorial_recovery_writers) AS pending FROM editorial_recovery_control WHERE singleton=1",
    )
    .first<{
      phase: string;
      capture_id: string;
      generation: number;
      pending: number;
    }>();
  if (
    !state ||
    state.phase !== "draining" ||
    state.capture_id !== captureId ||
    state.generation !== generation ||
    state.pending !== 0
  )
    throw new Error("recovery_fence_lost");
}

/** Reopen only the exact drained generation, atomically checking outstanding
 * external writers. This is completion of a qualified snapshot, not rollback or
 * a cross-store atomic transaction. Keep capture_id for confirmed readback. */
export async function releaseRecoveryDatabase(
  db: PublicationDatabase,
  captureId: string,
  generation: number,
): Promise<void> {
  const result = await db.batch<{
    phase: string;
    capture_id: string;
    generation: number;
    pending: number;
  }>([
    db
      .prepare(
        "UPDATE editorial_recovery_control SET phase='open' WHERE singleton=1 AND phase='draining' AND capture_id=? AND generation=? AND NOT EXISTS(SELECT 1 FROM editorial_recovery_writers)",
      )
      .bind(captureId, generation),
    db.prepare(
      "SELECT phase,capture_id,generation,(SELECT count(*) FROM editorial_recovery_writers) AS pending FROM editorial_recovery_control WHERE singleton=1",
    ),
  ]);
  const state = result[1]?.results[0];
  if (
    result.length !== 2 ||
    result.some((row) => !row.success) ||
    result[0]?.meta?.changes !== 1 ||
    !state ||
    state.phase !== "open" ||
    state.capture_id !== captureId ||
    state.generation !== generation ||
    state.pending !== 0
  )
    throw new Error("recovery_completion_unconfirmed");
}
