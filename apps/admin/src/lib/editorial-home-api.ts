import { EDITORIAL_OWNER_EMAIL } from "./editorial-owner";
import {
  MAX_SOURCE_BYTES,
  editorialRecordSchema,
  type EditorialRecord,
  validateEditorialSource,
} from "@anipotts/content/editorial/source";
import type { EditorialDraftStore } from "../editorial/draft-store";
import { newWritingSource } from "./writing-draft";
import {
  checkEditorialMutation,
  issueEditorialCsrf,
  privateEditorialResponse as json,
  readEditorialJson,
} from "./editorial-security";

export const homeRecord = { kind: "page", id: "home" } as const;
export type HomeBase = {
  source: string;
  baseCommit: string;
  baseFileHash: string | null;
};
export type DraftStorage = Pick<
  EditorialDraftStore,
  "get" | "save" | "rebase" | "history" | "discard" | "restore" | "conflict"
>;
export type PublicationStorage = Pick<
  EditorialDraftStore,
  | "startPublication"
  | "latestPublication"
  | "publicationStatus"
  | "retryPublication"
  | "cancelPublication"
>;

/** Called only after owner verification. The browser never supplies a Git path or base. */
export async function homeEditorApi(
  request: Request,
  storage: DraftStorage,
  readBase: (record: EditorialRecord) => Promise<HomeBase>,
  publisher?: { storage: PublicationStorage; enabled: boolean },
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
  if (request.method === "GET") {
    if (action === "csrf") return issueEditorialCsrf(request);
    if (action === "home" || action === "record") {
      const [base, draft, history] = await Promise.all([
        readBase(record),
        storage.get(record),
        storage.history(record),
      ]);
      const publication = publisher
        ? await publisher.storage.latestPublication(record)
        : null;
      return json({
        recoveryScope: EDITORIAL_OWNER_EMAIL,
        base,
        draft,
        history,
        publication,
        publishing: publisher?.enabled ? "ready" : "not_configured",
      });
    }
    if (action === "publication" && publisher) {
      const id = url.searchParams.get("operationId");
      const publication = id
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
  if (
    !body ||
    typeof body !== "object" ||
    !("expectedRevision" in body) ||
    !Number.isSafeInteger(body.expectedRevision) ||
    Number(body.expectedRevision) < 0
  )
    return json({ error: "invalid_revision" }, 400);
  const expectedRevision = Number(body.expectedRevision);
  if (action === "create") {
    if (
      record.kind !== "writing" ||
      expectedRevision !== 0 ||
      !("title" in body) ||
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.length > 300 ||
      !("requestId" in body) ||
      typeof body.requestId !== "string"
    )
      return json({ error: "invalid_request" }, 400);
    const base = await readBase(record);
    if (base.baseFileHash !== null)
      return json({ error: "record_exists" }, 409);
    const result = await storage.save({
      record,
      source: newWritingSource(body.title),
      expectedRevision: 0,
      requestId: body.requestId,
      baseCommit: base.baseCommit,
      baseFileHash: null,
    });
    return json(result, result.ok ? 201 : 409);
  }
  if (
    action === "publish" ||
    action === "retry-publication" ||
    action === "cancel-publication"
  ) {
    if (!publisher?.enabled)
      return json({ error: "publisher_not_configured" }, 503);
    if (
      !("operationId" in body) ||
      typeof body.operationId !== "string" ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(body.operationId)
    )
      return json({ error: "invalid_request" }, 400);
    if (action === "publish") {
      if (!("discloseSource" in body) || body.discloseSource !== true)
        return json({ error: "source_disclosure_required" }, 400);
      const result = await publisher.storage.startPublication({
        record,
        operationId: body.operationId,
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
    if (
      !("expectedVersion" in body) ||
      !Number.isSafeInteger(body.expectedVersion)
    )
      return json({ error: "invalid_request" }, 400);
    const result =
      action === "cancel-publication"
        ? await publisher.storage.cancelPublication(
            record,
            body.operationId,
            Number(body.expectedVersion),
          )
        : await publisher.storage.retryPublication(
            record,
            body.operationId,
            Number(body.expectedVersion),
          );
    return json(result, result.ok ? 202 : 409);
  }
  if (action === "save" || action === "rebase") {
    if (
      !("source" in body) ||
      typeof body.source !== "string" ||
      !("requestId" in body) ||
      typeof body.requestId !== "string"
    )
      return json({ error: "invalid_request" }, 400);
    const current = await storage.get(record);
    const base =
      action === "rebase"
        ? await readBase(record)
        : (current ?? (await readBase(record)));
    if (
      action === "rebase" &&
      (!("reviewedBaseCommit" in body) ||
        body.reviewedBaseCommit !== base.baseCommit ||
        !("reviewedBaseFileHash" in body) ||
        body.reviewedBaseFileHash !== base.baseFileHash)
    )
      return json({ error: "upstream_changed", base }, 409);
    const result = await storage[action]({
      record,
      source: body.source,
      expectedRevision,
      requestId: body.requestId,
      baseCommit: base.baseCommit,
      baseFileHash: base.baseFileHash,
    });
    let valid = false;
    try {
      valid = validateEditorialSource(record, body.source).success;
    } catch {
      /* Invalid intermediate source is still privately saved. */
    }
    return json(
      { ...result, valid },
      result.ok ? 200 : result.code === "revision_conflict" ? 409 : 400,
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
