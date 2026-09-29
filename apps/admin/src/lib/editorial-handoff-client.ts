import {
  editorialRecordSchema,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import { EDITORIAL_OWNER_EMAIL } from "./editorial-owner";
import {
  referencedMediaIds,
  MAX_PUBLICATION_MEDIA_BYTES,
  MAX_PUBLICATION_IMAGES,
} from "./editorial-media";
export const HANDOFF_LOCAL = "http://localhost:4311";
// Three minutes covers sign-in, preparation and transfer. Reserve 35 seconds
// for the sender's two bounded local acknowledgment requests after receiver work.
export const HANDOFF_TIMEOUT_MS = 180000;
export const HANDOFF_ACK_RESERVE_MS = 35000;
export function handoffExecutionDeadline(
  senderDeadline: unknown,
  now = Date.now(),
): number {
  if (
    typeof senderDeadline !== "number" ||
    !Number.isSafeInteger(senderDeadline) ||
    senderDeadline > now + HANDOFF_TIMEOUT_MS ||
    senderDeadline - HANDOFF_ACK_RESERVE_MS <= now
  )
    throw new Error(
      "Transfer expired. Your draft was kept. Retry to confirm publishing status.",
    );
  return senderDeadline - HANDOFF_ACK_RESERVE_MS;
}
export const HANDOFF_PRODUCTION = "https://admin.anipotts.com";
export type HandoffPayload = {
  record: EditorialRecord;
  source: string;
  localRevision: number;
  baseSha256: string;
  operationId: string;
  publish?: boolean;
};
export type HandoffReceipt = {
  record: EditorialRecord;
  operationId: string;
  revision: number;
  sourceSha256: string;
  expectedPublicationId: string | null;
  directPublication?: {
    publicationId: string;
    record: EditorialRecord;
    revision: number;
    sourceSha256: string;
    publishedAt: string;
  };
};
type HandoffIntent = Pick<HandoffPayload, "record" | "operationId"> & {
  sourceSha256: string;
};
const publicationId = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const sourceHash = /^[a-f0-9]{64}$/;
const positiveRevision = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Both sides validate the same immutable intent before reporting success.
 * A publication receipt proves activation, not independently verified rendering.
 */
export function validateHandoffReceipt(
  value: unknown,
  intent: HandoffIntent,
  requirePublication = false,
): HandoffReceipt {
  const invalid = () =>
    new Error(
      "Production confirmation did not match this draft. Your local draft was kept; retry to confirm publishing status.",
    );
  const receipt = object(value);
  const record = editorialRecordSchema.safeParse(receipt?.record);
  if (
    typeof intent.operationId !== "string" ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(
      intent.operationId,
    ) ||
    !receipt ||
    !record.success ||
    record.data.kind !== intent.record.kind ||
    record.data.id !== intent.record.id ||
    receipt.operationId !== intent.operationId ||
    !positiveRevision(receipt.revision) ||
    typeof receipt.sourceSha256 !== "string" ||
    !sourceHash.test(receipt.sourceSha256) ||
    receipt.sourceSha256 !== intent.sourceSha256 ||
    !(
      receipt.expectedPublicationId === null ||
      (typeof receipt.expectedPublicationId === "string" &&
        publicationId.test(receipt.expectedPublicationId))
    )
  )
    throw invalid();
  const confirmed: HandoffReceipt = {
    record: record.data,
    operationId: intent.operationId,
    revision: receipt.revision,
    sourceSha256: receipt.sourceSha256,
    expectedPublicationId: receipt.expectedPublicationId,
  };
  if (!requirePublication) {
    // A draft-only transfer must never silently accept a publication outcome.
    if (receipt.directPublication !== undefined) throw invalid();
    return confirmed;
  }
  const published = object(receipt.directPublication);
  const publishedRecord = editorialRecordSchema.safeParse(published?.record);
  if (
    !published ||
    !publishedRecord.success ||
    publishedRecord.data.kind !== record.data.kind ||
    publishedRecord.data.id !== record.data.id ||
    published.publicationId !== intent.operationId ||
    !positiveRevision(published.revision) ||
    published.revision !== receipt.revision ||
    published.sourceSha256 !== intent.sourceSha256 ||
    typeof published.publishedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      published.publishedAt,
    ) ||
    !Number.isFinite(Date.parse(published.publishedAt))
  )
    throw invalid();
  return {
    ...confirmed,
    directPublication: {
      publicationId: intent.operationId,
      record: publishedRecord.data,
      revision: published.revision,
      sourceSha256: intent.sourceSha256,
      publishedAt: published.publishedAt,
    },
  };
}
/** Persist only operation metadata, so reloads retry the same immutable intent. */
export function stableHandoffOperationId(
  record: EditorialRecord,
  sourceSha256: string,
  baseSha256: string,
  publish = false,
): string {
  if (
    location.origin !== HANDOFF_LOCAL ||
    !/^[a-f0-9]{64}$/.test(sourceSha256) ||
    !/^[a-f0-9]{64}$/.test(baseSha256)
  )
    throw new Error("Invalid draft transfer identity.");
  const key = `editorial-handoff:${EDITORIAL_OWNER_EMAIL}:content:${record.kind}:${record.id}:${sourceSha256}:${baseSha256}:${publish ? "publish" : "save"}`;
  const prior = localStorage.getItem(key);
  if (prior && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(prior))
    return prior;
  const id = crypto.randomUUID();
  // Failing persistence must not silently create a non-retryable transfer.
  localStorage.setItem(key, id);
  return id;
}
export async function handoffSha256(value: string | ArrayBuffer) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function startEditorialHandoff(
  payload: Promise<HandoffPayload> | HandoffPayload,
): Promise<{ popup: Window; receipt: HandoffReceipt }> {
  // The caller may have started preparation before checking popup permission.
  // Observe rejection immediately, including every early return below.
  const observedPayload = Promise.resolve(payload);
  void observedPayload.catch(() => {});
  const deadline = Date.now() + HANDOFF_TIMEOUT_MS;
  if (location.origin !== HANDOFF_LOCAL)
    return Promise.reject(
      new Error("Use the local editor to transfer this draft."),
    );
  const nonce = crypto.randomUUID();
  const popup = window.open(
    `${HANDOFF_PRODUCTION}/content/transfer#${nonce}`,
    "_blank",
  );
  if (!popup)
    return Promise.reject(
      new Error("Allow the production editor window, then try again."),
    );
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    let sent = false;
    let delivered = false;
    let ended = false;
    const cleanup = () => {
      ended = true;
      controller.abort();
      clearTimeout(timeout);
      clearInterval(closed);
      window.removeEventListener("message", receive);
    };
    const fail = (error: unknown) => {
      cleanup();
      reject(
        error instanceof Error
          ? error
          : new Error("Transfer failed. Your local draft was kept."),
      );
    };
    const timeout = setTimeout(
      () =>
        fail(
          new Error(
            "Transfer timed out. Your draft was kept. Retry to confirm whether publishing finished.",
          ),
        ),
      HANDOFF_TIMEOUT_MS,
    );
    const closed = setInterval(() => {
      if (popup.closed)
        fail(new Error("Production editor closed. Your local draft was kept."));
    }, 500);
    const prepared = observedPayload.then(async (p) => {
      if (!Number.isSafeInteger(p.localRevision) || p.localRevision < 1)
        throw new Error("Save this draft before transferring it.");
      const ids = referencedMediaIds(p.source);
      if (ids.length > MAX_PUBLICATION_IMAGES)
        throw new Error("Too many images to transfer.");
      let total = 0;
      const media = [];
      for (const id of ids) {
        const response = await fetch(`/api/editorial/media?id=${id}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Couldn’t read a draft image.");
        const bytes = await response.arrayBuffer();
        total += bytes.byteLength;
        if (
          total > MAX_PUBLICATION_MEDIA_BYTES ||
          (await handoffSha256(bytes)) !== id.split(".")[0]
        )
          throw new Error("Couldn’t verify draft images.");
        let binary = "";
        for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
        media.push({ id, base64: btoa(binary) });
      }
      return { ...p, media };
    });
    prepared.catch(fail);
    const receive = (event: MessageEvent) => {
      if (
        ended ||
        event.origin !== HANDOFF_PRODUCTION ||
        event.source !== popup ||
        event.data?.nonce !== nonce
      )
        return;
      if (event.data.type === "editorial-handoff-ready" && !sent) {
        sent = true;
        void prepared
          .then((p) => {
            if (!ended && !popup.closed)
              popup.postMessage(
                { type: "editorial-handoff-data", nonce, deadline, payload: p },
                HANDOFF_PRODUCTION,
              );
            if (!ended && !popup.closed) delivered = true;
          })
          .catch(fail);
      }
      if (event.data.type === "editorial-handoff-done") {
        if (ended || !delivered) return;
        cleanup();
        void prepared
          .then(async (p) => {
            const receipt = validateHandoffReceipt(
              event.data.receipt,
              {
                record: p.record,
                operationId: p.operationId,
                sourceSha256: await handoffSha256(p.source),
              },
              p.publish === true,
            );
            if (receipt.directPublication) {
              const csrf = await fetch("/api/editorial/csrf", {
                signal: AbortSignal.timeout(15000),
              });
              if (!csrf.ok)
                throw new Error(
                  "Published. Local confirmation failed; retry to reconcile.",
                );
              const token = await csrf.json();
              const ack = await fetch("/api/editorial/ack-publication", {
                method: "POST",
                signal: AbortSignal.timeout(15000),
                headers: {
                  "Content-Type": "application/json",
                  "X-Editorial-CSRF": token.csrf,
                },
                body: JSON.stringify({
                  record: p.record,
                  source: p.source,
                  localRevision: p.localRevision,
                  publicationId: receipt.directPublication.publicationId,
                  sourceSha256: receipt.directPublication.sourceSha256,
                }),
              });
              if (!ack.ok)
                throw new Error(
                  "Published. Local confirmation failed; retry to reconcile.",
                );
            }
            resolve({ popup, receipt });
          })
          .catch(reject);
      }
      if (event.data.type === "editorial-handoff-error")
        fail(
          new Error(
            typeof event.data.error === "string"
              ? event.data.error
              : "Transfer failed.",
          ),
        );
    };
    window.addEventListener("message", receive);
  });
}
