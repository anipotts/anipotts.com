import { createHash } from "node:crypto";
import {
  editorialRecordSchema,
  MAX_SOURCE_BYTES,
  validateEditorialSource,
  type EditorialRecord,
} from "@anipotts/content/editorial/source";
import type { EditorialDraftStore } from "../editorial/draft-store";
import {
  referencedMediaIds,
  MAX_PUBLICATION_IMAGES,
  MAX_PUBLICATION_MEDIA_BYTES,
} from "./editorial-media";
import {
  checkEditorialMutation,
  privateEditorialResponse as json,
  readEditorialJson,
} from "./editorial-security";
export async function editorialHandoffApi(
  request: Request,
  deps: {
    storage: Pick<EditorialDraftStore, "importHandoff" | "saveMedia">;
    readBase(record: EditorialRecord): Promise<{
      source: string;
      baseCommit: string;
      baseFileHash: string | null;
      directPublication?: { publicationId: string } | null;
    }>;
  },
) {
  if (request.method !== "POST")
    return json({ error: "method_not_allowed" }, 405);
  const rejection = checkEditorialMutation(
    request,
    new URL(request.url).origin,
  );
  if (rejection) return json({ error: rejection }, 403);
  let body: unknown;
  try {
    body = await readEditorialJson(
      request,
      MAX_SOURCE_BYTES * 6 +
        Math.ceil(MAX_PUBLICATION_MEDIA_BYTES / 3) * 4 +
        4096,
    );
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const b = body as {
    record?: unknown;
    source?: unknown;
    operationId?: unknown;
    baseSha256?: unknown;
    media?: unknown;
  };
  const record = editorialRecordSchema.safeParse(b?.record);
  if (
    !record.success ||
    typeof b.source !== "string" ||
    typeof b.operationId !== "string" ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(b.operationId) ||
    typeof b.baseSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(b.baseSha256) ||
    !Array.isArray(b.media)
  )
    return json({ error: "invalid_request" }, 400);
  try {
    if (!validateEditorialSource(record.data, b.source).success)
      throw new Error();
  } catch {
    return json({ error: "invalid_source" }, 400);
  }
  const ids = referencedMediaIds(b.source);
  if (ids.length > MAX_PUBLICATION_IMAGES || b.media.length !== ids.length)
    return json({ error: "invalid_media" }, 400);
  const files: Uint8Array[] = [];
  let total = 0;
  for (const id of ids) {
    const matches = b.media.filter(
      (m: unknown) =>
        m && typeof m === "object" && (m as { id?: unknown }).id === id,
    );
    if (matches.length !== 1 || typeof matches[0].base64 !== "string")
      return json({ error: "invalid_media" }, 400);
    const bytes = Buffer.from(matches[0].base64, "base64");
    total += bytes.length;
    if (
      !bytes.length ||
      total > MAX_PUBLICATION_MEDIA_BYTES ||
      bytes.toString("base64") !== matches[0].base64 ||
      createHash("sha256").update(bytes).digest("hex") !== id.split(".")[0]
    )
      return json({ error: "invalid_media" }, 400);
    files.push(bytes);
  }
  const base = await deps.readBase(record.data);
  for (let i = 0; i < files.length; i++) {
    const saved = await deps.storage.saveMedia(files[i]!);
    if (!saved.ok || saved.media.id !== ids[i])
      return json({ error: "invalid_media" }, 400);
  }
  const result = await deps.storage.importHandoff({
    record: record.data,
    source: b.source,
    operationId: b.operationId,
    baseSha256: b.baseSha256,
    base,
  });
  if (!result.ok)
    return json(
      { error: result.code },
      result.code.includes("conflict") ? 409 : 400,
    );
  return json({
    record: record.data,
    operationId: b.operationId,
    revision: result.draft.revision,
    sourceSha256: createHash("sha256")
      .update(result.draft.source)
      .digest("hex"),
    expectedPublicationId: result.expectedPublicationId,
  });
}

/** Route dispatcher must expose this only in development. */
export async function acknowledgePublicationApi(
  request: Request,
  storage: Pick<EditorialDraftStore, "acknowledgeLocalPublication">,
) {
  if (
    new URL(request.url).origin !== "http://localhost:4311" ||
    request.method !== "POST"
  )
    return json({ error: "not_found" }, 404);
  const rejection = checkEditorialMutation(
    request,
    new URL(request.url).origin,
  );
  if (rejection) return json({ error: rejection }, 403);
  let body: unknown;
  try {
    body = await readEditorialJson(request, MAX_SOURCE_BYTES * 6 + 4096);
  } catch {
    return json({ error: "invalid_request" }, 400);
  }
  const b = body as {
    record?: unknown;
    source?: unknown;
    sourceSha256?: unknown;
    publicationId?: unknown;
    localRevision?: unknown;
  };
  const record = editorialRecordSchema.safeParse(b?.record);
  if (
    !record.success ||
    typeof b.source !== "string" ||
    typeof b.sourceSha256 !== "string" ||
    typeof b.publicationId !== "string" ||
    typeof b.localRevision !== "number" ||
    !Number.isSafeInteger(b.localRevision) ||
    b.localRevision < 1
  )
    return json({ error: "invalid_request" }, 400);
  const result = await storage.acknowledgeLocalPublication({
    record: record.data,
    source: b.source,
    sourceSha256: b.sourceSha256,
    publicationId: b.publicationId,
    localRevision: b.localRevision,
  });
  return json(result, result.ok ? 200 : 409);
}
