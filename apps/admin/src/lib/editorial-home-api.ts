import { z } from "astro/zod";
import { EDITORIAL_OWNER_EMAIL } from "./editorial-owner";
import {
  MAX_SOURCE_BYTES,
  editorialRecordSchema,
  type EditorialRecord,
  validateEditorialSource,
} from "@anipotts/content/editorial/source";
import type { EditorialDraftStore } from "../editorial/draft-store";
import { newRecordSource } from "./editorial-collections";
import {
  MAX_PUBLICATION_QUEUE_PAGE,
  type StartDirectPublication,
} from "./editorial-publication-status";
import {
  checkEditorialMutation,
  issueEditorialCsrf,
  privateJson as json,
  readEditorialJson,
} from "./editorial-security";
import { OPERATION_ID, POSITIVE_INTEGER } from "./patterns";

export const homeRecord = { kind: "page", id: "home" } as const;
export type HomeBase = {
  source: string;
  baseCommit: string;
  baseFileHash: string | null;
  publicationId?: string | null;
  sourceSha256?: string;
  inventoryVersion?: number;
};
export type DraftStorage = Pick<
  EditorialDraftStore,
  | "get"
  | "save"
  | "rebase"
  | "history"
  | "historyPage"
  | "discard"
  | "restore"
  | "conflict"
>;
export type PublicationStorage = Pick<
  EditorialDraftStore,
  | "startPublication"
  | "latestPublication"
  | "publicationStatus"
  | "publicationQueue"
  | "retryPublication"
  | "cancelPublication"
  | "cancelUnstartedLegacyPublication"
>;
type DirectStorage = Pick<
  EditorialDraftStore,
  | "startDirectPublication"
  | "latestDirectPublication"
  | "directPublicationStatus"
  | "retryDirectPublication"
  | "cancelDirectPublication"
>;

// One schema per request body. A failure keeps the error code its action has
// always returned, and nothing outside a schema is read.
const safeInteger = z.number().int().safe();
const revisionBody = z.object({ expectedRevision: safeInteger.min(0) });
const operationBody = z.object({
  operationId: z.string().regex(OPERATION_ID),
});
const legacyCancelBody = operationBody.extend({
  expectedVersion: safeInteger.min(0),
});
const versionBody = z.object({ expectedVersion: safeInteger });
const disclosureBody = z.object({ discloseSource: z.literal(true) });
const reviewBody = z.object({
  reviewedSourceSha256: z.string(),
  expectedBaselineSha256: z.string(),
  expectedPublicationId: z.string().nullable(),
});
const createBody = z.object({
  title: z
    .string()
    .max(300)
    .refine((title) => title.trim() !== ""),
  requestId: z.string(),
});
const writeBody = z.object({ source: z.string(), requestId: z.string() });

function parse<T>(schema: z.ZodType<T>, body: unknown): T | null {
  const result = schema.safeParse(body);
  return result.success ? result.data : null;
}

/** Positive integer page parameters; null when one is malformed or too large. */
function pageParams<K extends string>(
  url: URL,
  cursor: K,
  maxLimit: number,
): Partial<Record<K | "limit", number>> | null {
  const options: Partial<Record<K | "limit", number>> = {};
  for (const name of [cursor, "limit"] as const) {
    const value = url.searchParams.get(name);
    if (value === null) continue;
    if (!POSITIVE_INTEGER.test(value) || !Number.isSafeInteger(Number(value)))
      return null;
    options[name] = Number(value);
  }
  return (options.limit ?? 0) > maxLimit ? null : options;
}

/** Starts a direct intent and answers with its stored status. */
async function startDirect(
  direct: DirectStorage,
  input: StartDirectPublication,
): Promise<Response> {
  const result = await direct.startDirectPublication(input);
  if (!result.ok)
    return json(
      {
        error: result.code,
        ...("publication" in result ? { publication: result.publication } : {}),
      },
      409,
    );
  return json(
    {
      publication: await direct.directPublicationStatus(
        input.record,
        result.publication.id,
      ),
    },
    202,
  );
}

/** Called only after owner verification. The browser never supplies a Git path or base. */
export async function homeEditorApi(
  request: Request,
  storage: DraftStorage,
  readBase: (record: EditorialRecord) => Promise<HomeBase>,
  publisher?: {
    storage: PublicationStorage;
    enabled: boolean;
    mode?: "legacy" | "maintenance" | "direct";
    direct?: DirectStorage;
  },
): Promise<Response> {
  const url = new URL(request.url);
  const action = url.pathname.split("/").at(-1);
  const identity = editorialRecordSchema.safeParse(
    url.searchParams.has("kind") || url.searchParams.has("id")
      ? { kind: url.searchParams.get("kind"), id: url.searchParams.get("id") }
      : homeRecord,
  );
  if (!identity.success) return json({ error: "invalid_record" }, 400);
  const record = identity.data;
  const directMode =
    publisher?.mode === "direct" || publisher?.mode === "maintenance";
  const direct = directMode ? publisher?.direct : undefined;
  if (directMode && !direct)
    return json({ error: "publisher_unavailable" }, 503);
  if (request.method === "GET") {
    if (action === "csrf") return issueEditorialCsrf(request);
    if (action === "draft") return json({ draft: await storage.get(record) });
    if (action === "baseline") return json({ base: await readBase(record) });
    if (action === "history") {
      const options = pageParams(url, "beforeRevision", 100);
      if (!options) return json({ error: "invalid_history_page" }, 400);
      return json(await storage.historyPage(record, options));
    }
    if (action === "home" || action === "record") {
      const [base, draft, historyPage] = await Promise.all([
        readBase(record),
        storage.get(record),
        storage.historyPage(record),
      ]);
      const publication = direct
        ? await direct.latestDirectPublication(record)
        : publisher
          ? await publisher.storage.latestPublication(record)
          : null;
      return json({
        recoveryScope: EDITORIAL_OWNER_EMAIL,
        base,
        draft,
        history: historyPage.history,
        nextBeforeRevision: historyPage.nextBeforeRevision,
        publication,
        publishing: publisher?.enabled ? "ready" : "not_configured",
        // Production publishes directly, so an editor without a publisher
        // (local development) shows the same review and field rules.
        publicationMode: publisher?.mode ?? "direct",
      });
    }
    if (action === "publication-queue" && publisher) {
      const options = pageParams(
        url,
        "afterSequence",
        MAX_PUBLICATION_QUEUE_PAGE,
      );
      if (!options) return json({ error: "invalid_publication_page" }, 400);
      return json(await publisher.storage.publicationQueue(options));
    }
    if (action === "legacy-publication" && publisher) {
      const id = url.searchParams.get("operationId");
      if (!id || !OPERATION_ID.test(id))
        return json({ error: "invalid_request" }, 400);
      return json({
        publication: await publisher.storage.publicationStatus(record, id),
      });
    }
    if (action === "publication" && publisher) {
      const id = url.searchParams.get("operationId");
      const publication = direct
        ? id
          ? await direct.directPublicationStatus(record, id)
          : await direct.latestDirectPublication(record)
        : id
          ? await publisher.storage.publicationStatus(record, id)
          : await publisher.storage.latestPublication(record);
      return json({ publication });
    }
    return json({ error: "not_found" }, 404);
  }
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);
  const rejection = checkEditorialMutation(request, url.origin);
  if (rejection) return json({ error: rejection }, 403);
  let body: unknown;
  try {
    body = await readEditorialJson(request, MAX_SOURCE_BYTES * 6 + 1024);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const revision = parse(revisionBody, body);
  if (!revision) return json({ error: "invalid_revision" }, 400);
  const { expectedRevision } = revision;
  if (action === "cancel-legacy-publication") {
    // Publishing stays disabled in maintenance. This narrowly scoped operation
    // uses the same verified owner, origin and CSRF boundary as draft writes.
    if (!publisher || publisher.mode !== "maintenance")
      return json({ error: "maintenance_required" }, 409);
    const input = parse(legacyCancelBody, body);
    if (!input || expectedRevision < 1)
      return json({ error: "invalid_request" }, 400);
    const result = await publisher.storage.cancelUnstartedLegacyPublication(
      record,
      input.operationId,
      expectedRevision,
      input.expectedVersion,
    );
    return json(
      {
        ...result,
        publication: await publisher.storage.publicationStatus(
          record,
          input.operationId,
        ),
      },
      result.ok ? 200 : 409,
    );
  }
  if (action === "create") {
    const input = parse(createBody, body);
    if (
      (record.kind !== "writing" && record.kind !== "work") ||
      expectedRevision !== 0 ||
      !input
    )
      return json({ error: "invalid_request" }, 400);
    const base = await readBase(record);
    if (base.baseFileHash !== null)
      return json({ error: "record_exists" }, 409);
    const result = await storage.save({
      record,
      source: newRecordSource(record, input.title),
      expectedRevision: 0,
      requestId: input.requestId,
      baseCommit: base.baseCommit,
      baseFileHash: null,
    });
    return json(result, result.ok ? 201 : 409);
  }
  if (
    action === "publish" ||
    action === "unpublish" ||
    action === "retry-publication" ||
    action === "cancel-publication"
  ) {
    if (!publisher?.enabled)
      return json({ error: "publisher_not_configured" }, 503);
    const operation = parse(operationBody, body);
    if (!operation) return json({ error: "invalid_request" }, 400);
    const { operationId } = operation;
    if (action === "unpublish") {
      // Direct publishing only: the older repository publisher has no
      // reviewed lifecycle for taking a piece off the site.
      if (!direct || publisher.mode !== "direct")
        return json({ error: "unpublish_requires_direct_publishing" }, 409);
      const review = parse(reviewBody, body);
      if (!review) return json({ error: "invalid_request" }, 400);
      // The browser reviewed hashes only. The public source comes from the
      // server's own read, and the publisher checks it against both.
      const base = await readBase(record);
      return startDirect(direct, {
        record,
        operationId,
        // A record with no private draft still has an immutable revision.
        expectedRevision: Math.max(1, expectedRevision),
        ...review,
        action: "unpublish",
        baselineSource: base.source,
      });
    }
    if (action === "publish") {
      if (!parse(disclosureBody, body))
        return json({ error: "source_disclosure_required" }, 400);
      if (direct) {
        const review = parse(reviewBody, body);
        if (!review)
          return json({ error: "publication_review_upgrade_required" }, 409);
        return startDirect(direct, {
          record,
          operationId,
          expectedRevision,
          ...review,
        });
      }
      const result = await publisher.storage.startPublication({
        record,
        operationId,
        expectedRevision,
      });
      if (!result.ok)
        return json(
          { error: result.code },
          result.code === "revision_conflict" ? 409 : 400,
        );
      return json(
        {
          publication: await publisher.storage.publicationStatus(
            record,
            result.publication.id,
          ),
        },
        202,
      );
    }
    const version = parse(versionBody, body);
    if (!version) return json({ error: "invalid_request" }, 400);
    const { expectedVersion } = version;
    const cancel = action === "cancel-publication";
    const result = direct
      ? cancel
        ? await direct.cancelDirectPublication(
            record,
            operationId,
            expectedVersion,
          )
        : await direct.retryDirectPublication(
            record,
            operationId,
            expectedVersion,
          )
      : cancel
        ? await publisher.storage.cancelPublication(
            record,
            operationId,
            expectedVersion,
          )
        : await publisher.storage.retryPublication(
            record,
            operationId,
            expectedVersion,
          );
    return json(
      {
        ...result,
        publication: direct
          ? await direct.directPublicationStatus(record, operationId)
          : await publisher.storage.publicationStatus(record, operationId),
      },
      result.ok ? 202 : 409,
    );
  }
  if (action === "save" || action === "rebase") {
    const input = parse(writeBody, body);
    if (!input) return json({ error: "invalid_request" }, 400);
    const current = await storage.get(record);
    const base =
      action === "rebase"
        ? await readBase(record)
        : (current ?? (await readBase(record)));
    // The revision schema already proved the body is an object.
    const reviewed = body as Record<string, unknown>;
    if (
      action === "rebase" &&
      (!("reviewedBaseCommit" in reviewed) ||
        reviewed.reviewedBaseCommit !== base.baseCommit ||
        !("reviewedBaseFileHash" in reviewed) ||
        reviewed.reviewedBaseFileHash !== base.baseFileHash)
    )
      return json({ error: "upstream_changed", base }, 409);
    const result = await storage[action]({
      record,
      source: input.source,
      expectedRevision,
      requestId: input.requestId,
      baseCommit: base.baseCommit,
      baseFileHash: base.baseFileHash,
    });
    let valid = false;
    try {
      valid = validateEditorialSource(record, input.source).success;
    } catch {
      /* Invalid intermediate source is still privately saved. */
    }
    return json(
      { ...result, valid },
      result.ok
        ? 200
        : result.code === "revision_conflict" ||
            result.code === "save_reconciliation_required"
          ? 409
          : 400,
    );
  }
  if (action === "discard" || action === "restore") {
    try {
      return json({
        draft: await storage[action](record, expectedRevision),
      });
    } catch {
      return json(
        { error: "revision_conflict", current: await storage.get(record) },
        409,
      );
    }
  }
  return json({ error: "not_found" }, 404);
}
