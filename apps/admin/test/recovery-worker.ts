import { EditorialDraftStore } from "../src/editorial/draft-store";
import { DirectPublisher } from "../src/editorial/direct-publisher";
import { RecoveryCoordinator } from "../src/editorial/recovery-coordinator";
import { captureRecovery } from "../src/editorial/recovery-storage";
import { SuspendedRecoveryTarget } from "../src/editorial/recovery-target";

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
  async captureWithDelayedInventory(timeoutMs: number, delayMs: number) {
    const bucket = this.#bindings.RECOVERY_SOURCE_MEDIA;
    const delayed = new Proxy(bucket, {
      get(target, property) {
        if (property === "list")
          return async (options?: R2ListOptions) => {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            return target.list(options);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return captureRecovery(
      this.ctx.storage,
      this.#bindings.RECOVERY_SOURCE_DB,
      delayed,
      this.#bindings.RECOVERY_APPLICATION_REVISION,
      timeoutMs,
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
