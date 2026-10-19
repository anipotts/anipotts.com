import { EditorialDraftStore } from "../src/editorial/draft-store";
import { DirectPublisher } from "../src/editorial/direct-publisher";
import { RecoveryCoordinator } from "../src/editorial/recovery-coordinator";
import {
  captureRecovery,
  completeRecovery,
} from "../src/editorial/recovery-storage";
import { SuspendedRecoveryTarget } from "../src/editorial/recovery-target";
import { delayedSyntheticInventory } from "./recovery/eligibility";

type CaptureBindings = {
  RECOVERY_SOURCE_DB: D1Database;
  RECOVERY_SOURCE_MEDIA: R2Bucket;
  RECOVERY_APPLICATION_REVISION: string;
};
/** Synthetic-only RPC: not exported by src/worker.ts. */
export class CaptureFixture extends EditorialDraftStore {
  #bindings: CaptureBindings;
  constructor(ctx: DurableObjectState, env: CaptureBindings) {
    super(ctx, env);
    this.#bindings = env;
    new DirectPublisher(ctx.storage, null);
  }
  async capture(timeoutMs = 20_000) {
    return captureRecovery(
      this.ctx.storage,
      this.#bindings.RECOVERY_SOURCE_DB,
      this.#bindings.RECOVERY_SOURCE_MEDIA,
      this.#bindings.RECOVERY_APPLICATION_REVISION,
      timeoutMs,
    );
  }
  async complete(serialized: string, timeoutMs = 20_000) {
    return completeRecovery(
      this.ctx.storage,
      this.#bindings.RECOVERY_SOURCE_DB,
      serialized,
      timeoutMs,
    );
  }
  async completeWithLostResponse(serialized: string) {
    const interrupted = new Proxy(this.#bindings.RECOVERY_SOURCE_DB, {
      get(target, property) {
        if (property === "batch")
          return async (statements: D1PreparedStatement[]) => {
            await target.batch(statements);
            throw new Error("synthetic_completion_response_lost");
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return completeRecovery(this.ctx.storage, interrupted, serialized);
  }
  async captureWithDelayedInventory(timeoutMs: number, delayMs: number) {
    const delayed = delayedSyntheticInventory(
      this.#bindings.RECOVERY_SOURCE_MEDIA,
      delayMs,
    );
    return captureRecovery(
      this.ctx.storage,
      this.#bindings.RECOVERY_SOURCE_DB,
      delayed,
      this.#bindings.RECOVERY_APPLICATION_REVISION,
      timeoutMs,
    );
  }
  async captureUnsupportedBindings() {
    return captureRecovery(
      this.ctx.storage,
      (this.env as { RECOVERY_CONTENT_DB: D1Database }).RECOVERY_CONTENT_DB,
      (this.env as { RECOVERY_CONTENT_MEDIA: R2Bucket }).RECOVERY_CONTENT_MEDIA,
      this.#bindings.RECOVERY_APPLICATION_REVISION,
    );
  }
  async holdWriter(milliseconds: number) {
    return new RecoveryCoordinator(this.ctx.storage).writer(
      "synthetic-delay",
      async () => {
        await new Promise((resolve) => setTimeout(resolve, milliseconds));
        return "completed";
      },
    );
  }
}
declare const __EDITORIAL_PRE_CLIENT_HASH_SQL__: string;
/** A real SQLite object starts with the exact pre-clientHash table. The current
 * parent constructor performs its existing ADD COLUMN upgrade before serving. */
export class LegacyCaptureFixture extends CaptureFixture {
  constructor(ctx: DurableObjectState, env: CaptureBindings) {
    ctx.storage.sql.exec(__EDITORIAL_PRE_CLIENT_HASH_SQL__);
    super(ctx, env);
  }
}
export { SuspendedRecoveryTarget };
/** An actual local R2 put followed by a transport failure, not a memory adapter. */
export class InterruptedRecoveryTarget extends SuspendedRecoveryTarget {
  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    const bucket = env.RECOVERY_CONTENT_MEDIA as R2Bucket;
    super(ctx, {
      ...env,
      RECOVERY_CONTENT_MEDIA: {
        list: bucket.list.bind(bucket),
        put: bucket.put.bind(bucket),
        get: async () => {
          throw new Error("synthetic_transport_interruption");
        },
      },
    });
  }
}
export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
};
