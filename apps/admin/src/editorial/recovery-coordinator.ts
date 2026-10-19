/** Durable admission records survive eviction. An interrupted writer or capture
 * never becomes complete because a lease expired. No operational RPC is added. */
export const EDITORIAL_RECOVERY_SQL = `
CREATE TABLE IF NOT EXISTS editorial_recovery_control (
 singleton INTEGER PRIMARY KEY CHECK(singleton=1), generation INTEGER NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('open','draining','blocked','suspended')),
 capture_id TEXT
);
INSERT OR IGNORE INTO editorial_recovery_control VALUES (1,0,'open',NULL);
CREATE TABLE IF NOT EXISTS editorial_recovery_writers (token TEXT PRIMARY KEY, kind TEXT NOT NULL);
`;
type Control = { generation: number; phase: string; capture_id: string | null };
export class RecoveryCoordinator {
  constructor(private storage: DurableObjectStorage) {
    storage.sql.exec(EDITORIAL_RECOVERY_SQL);
  }
  private state(): Control {
    return this.storage.sql
      .exec<Control>(
        "SELECT generation,phase,capture_id FROM editorial_recovery_control WHERE singleton=1",
      )
      .one();
  }
  async writer<T>(kind: string, work: () => Promise<T>): Promise<T> {
    const token = crypto.randomUUID();
    this.storage.transactionSync(() => {
      if (this.state().phase !== "open")
        throw new Error("recovery_write_fenced");
      this.storage.sql.exec(
        "INSERT INTO editorial_recovery_writers VALUES (?,?)",
        token,
        kind,
      );
    });
    try {
      return await work();
    } finally {
      // Completion runs only in the still-live invocation. A terminated event
      // leaves its durable row, which blocks capture after reconstruction.
      this.storage.sql.exec(
        "DELETE FROM editorial_recovery_writers WHERE token=?",
        token,
      );
    }
  }
  async drain(captureId: string, timeoutMs = 10_000): Promise<number> {
    if (
      !/^[a-f0-9-]{36}$/u.test(captureId) ||
      timeoutMs < 1 ||
      timeoutMs > 20_000
    )
      throw new Error("recovery_invalid_capture");
    const generation = this.storage.transactionSync(() => {
      if (this.state().phase !== "open")
        throw new Error("recovery_capture_conflict");
      this.storage.sql.exec(
        "UPDATE editorial_recovery_control SET phase='draining',capture_id=?,generation=generation+1 WHERE singleton=1",
        captureId,
      );
      return this.state().generation;
    });
    const end = Date.now() + timeoutMs;
    try {
      while (
        this.storage.sql
          .exec<{ n: number }>(
            "SELECT count(*) AS n FROM editorial_recovery_writers",
          )
          .one().n !== 0
      ) {
        if (Date.now() >= end) throw new Error("recovery_writers_unresolved");
        await new Promise((resolve) => setTimeout(resolve, 10));
        this.assertFrozen(captureId, generation);
      }
      this.assertFrozen(captureId, generation);
      return generation;
    } catch (error) {
      this.block(captureId, generation);
      throw error;
    }
  }
  assertFrozen(captureId: string, generation: number): void {
    const state = this.state();
    if (
      state.phase !== "draining" ||
      state.capture_id !== captureId ||
      state.generation !== generation
    )
      throw new Error("recovery_fence_lost");
  }
  block(captureId: string, generation: number): void {
    this.storage.sql.exec(
      "UPDATE editorial_recovery_control SET phase='blocked' WHERE singleton=1 AND capture_id=? AND generation=?",
      captureId,
      generation,
    );
  }
}
