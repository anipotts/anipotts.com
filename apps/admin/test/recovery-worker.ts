import { EditorialDraftStore } from "../src/editorial/draft-store";
import { DirectPublisher } from "../src/editorial/direct-publisher";
import { RecoveryCoordinator } from "../src/editorial/recovery-coordinator";
import {
  captureRecovery,
  completeRecovery,
  captureRecoveryV3,
  completeRecoveryV3,
} from "../src/editorial/recovery-storage";
import { SuspendedRecoveryTarget as RecoveryTarget } from "../src/editorial/recovery-target";
import {
  createR2RecoveryArtifact,
  openR2RecoveryArtifact,
  type RecoveryArtifactDescriptor,
} from "../src/editorial/recovery-artifact-r2";
import type { RecoveryCaptureV3Context } from "../../../scripts/admin/recovery-capture-v3.mjs";
import type { RecoveryCaptureV3Event } from "../../../scripts/admin/recovery-capture-v3.mjs";
import { delayedSyntheticInventory } from "./recovery/eligibility";

type CaptureBindings = {
  RECOVERY_SOURCE_DB: D1Database;
  RECOVERY_SOURCE_MEDIA: R2Bucket;
  RECOVERY_ARTIFACTS: R2Bucket;
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
  /** Test-only artifact spool in a separate disposable object. Acquire RPC
   * stubs in the current caller context; never transport I/O handles/streams. */
  async putRecoveryArtifact(index: number, event: RecoveryCaptureV3Event) {
    if (!Number.isSafeInteger(index) || index < 0 || index > 7000)
      throw new Error("synthetic_artifact_index");
    await this.ctx.storage.put(`fixture-artifact:${index}`, event);
  }
  async getRecoveryArtifact(index: number): Promise<RecoveryCaptureV3Event> {
    if (!Number.isSafeInteger(index) || index < 0 || index > 7000)
      throw new Error("synthetic_artifact_index");
    const event = await this.ctx.storage.get<RecoveryCaptureV3Event>(
      `fixture-artifact:${index}`,
    );
    if (!event) throw new Error("synthetic_artifact_missing");
    return event;
  }
  /** Synthetic-only wrapper: all R2 I/O belongs to this current DO context.
   * Return bounded JSON metadata, never an adapter closure or provider handle. */
  async captureToR2(artifactId: string, key: Uint8Array) {
    const artifact = createR2RecoveryArtifact(
      this.#bindings.RECOVERY_ARTIFACTS,
      artifactId,
    );
    const captured = await captureRecoveryV3(
      this.ctx.storage,
      this.#bindings.RECOVERY_SOURCE_DB,
      this.#bindings.RECOVERY_SOURCE_MEDIA,
      this.#bindings.RECOVERY_APPLICATION_REVISION,
      key,
      artifact,
    );
    return JSON.stringify({ captured, descriptor: artifact.descriptor() });
  }
  async completeFromR2(
    serialized: string,
    key: Uint8Array,
    context: RecoveryCaptureV3Context,
  ) {
    const descriptor: RecoveryArtifactDescriptor = JSON.parse(serialized);
    return completeRecoveryV3(
      this.ctx.storage,
      this.#bindings.RECOVERY_SOURCE_DB,
      openR2RecoveryArtifact(this.#bindings.RECOVERY_ARTIFACTS, descriptor),
      key,
      context,
    );
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
/** Test-only artifact entry point; the production target has no bucket import. */
export class SuspendedRecoveryTarget extends RecoveryTarget {
  #artifacts: R2Bucket;
  constructor(ctx: DurableObjectState, env: Record<string, unknown>) {
    super(ctx, env);
    this.#artifacts = env.RECOVERY_ARTIFACTS as R2Bucket;
  }
  async installFromR2(
    serialized: string,
    key: Uint8Array,
    context: RecoveryCaptureV3Context,
    changeSecondPass = false,
  ) {
    const descriptor: RecoveryArtifactDescriptor = JSON.parse(serialized);
    const source = openR2RecoveryArtifact(this.#artifacts, descriptor);
    let opens = 0;
    const bucket = this.#artifacts;
    const replay = async function* () {
      if (++opens === 2 && changeSecondPass) {
        const name = `editorial-recovery-artifacts/v1/${descriptor.artifactId}/index`;
        const value = await bucket.get(name);
        if (!value || value.size > 65536) throw new Error("synthetic_index");
        await bucket.put(name, await value.arrayBuffer());
      }
      yield* source();
    };
    // The generic report contains unknown values; JSON is a bounded by-value DTO,
    // not a remote capability or an I/O handle.
    return JSON.stringify(await this.installRecoveryV3(replay, key, context));
  }
}
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
