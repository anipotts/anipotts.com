import { type PublicationDatabase } from "@anipotts/content/editorial/direct-publication";
import { editorialRecordSchema } from "@anipotts/content/editorial/source";
import {
  directPublishDraft,
  type DirectPublisherDependencies,
} from "../editorial/direct-publisher";
import type { EditorialDraftStore } from "../editorial/draft-store";
import { homeEditorApi } from "./editorial-home-api";
import {
  readPublishedBase,
  validatePublishedCandidate,
} from "./editorial-published-base";
import {
  checkEditorialMutation,
  privateEditorialResponse as json,
  readEditorialJson,
} from "./editorial-security";

export type DirectEditorialRuntime = {
  db: PublicationDatabase;
  media: DirectPublisherDependencies["media"];
  storage: EditorialDraftStore;
  enabled: boolean;
  publicReady?: () => Promise<boolean>;
};

/** Invoked behind the existing owner middleware. No public or cross-origin writes. */
export async function directEditorialApi(
  request: Request,
  runtime: DirectEditorialRuntime,
) {
  const url = new URL(request.url);
  const action = url.pathname.split("/").at(-1);
  const identity = editorialRecordSchema.safeParse({
    kind: url.searchParams.get("kind") ?? "page",
    id: url.searchParams.get("id") ?? "home",
  });
  if (!identity.success) return json({ error: "invalid_record" }, 400);
  const record = identity.data;
  if (request.method === "POST" && action === "publish") {
    if (!runtime.enabled)
      return json({ error: "publisher_not_configured" }, 503);
    const rejection = checkEditorialMutation(request, url.origin);
    if (rejection) return json({ error: rejection }, 403);
    let body: Record<string, unknown>;
    try {
      body = (await readEditorialJson(request, 4096)) as Record<
        string,
        unknown
      >;
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    if (
      !body ||
      body.discloseSource !== true ||
      typeof body.operationId !== "string" ||
      typeof body.reviewedSourceSha256 !== "string" ||
      typeof body.expectedRevision !== "number" ||
      !(
        body.expectedPublicationId === null ||
        typeof body.expectedPublicationId === "string"
      )
    )
      return json({ error: "invalid_request" }, 400);
    if (runtime.publicReady && !(await runtime.publicReady()))
      return json({ error: "public_renderer_unavailable" }, 503);
    const result = await directPublishDraft(
      {
        store: runtime.storage,
        db: runtime.db,
        media: runtime.media,
        async validateSnapshot(candidate, source) {
          return validatePublishedCandidate(runtime.db, candidate, source);
        },
      },
      {
        record,
        operationId: body.operationId,
        expectedRevision: body.expectedRevision,
        expectedPublicationId: body.expectedPublicationId,
        reviewedSourceSha256: body.reviewedSourceSha256,
      },
    );
    if (!("publication" in result) || !result.publication)
      return json(
        { error: result.status },
        result.status.includes("conflict") ? 409 : 422,
      );
    // Stored/activated is distinct from independently verified public rendering.
    const { source: _source, ...receipt } = result.publication;
    return json({ directPublication: receipt, status: result.status });
  }
  let directPublication: Awaited<
    ReturnType<typeof readPublishedBase>
  >["directPublication"] = null;
  const response = await homeEditorApi(
    request,
    runtime.storage,
    async (candidate) => {
      const base = await readPublishedBase(runtime.db, candidate);
      directPublication = base.directPublication;
      return base;
    },
  );
  if (
    request.method === "GET" &&
    ["record", "home"].includes(action ?? "") &&
    response.ok
  ) {
    const data = (await response.json()) as Record<string, unknown>;
    return json({
      ...data,
      publishing: runtime.enabled ? "ready" : "not_configured",
      publicationMode: "direct",
      directPublication,
    });
  }
  return response;
}

export function directEditorialRuntime(
  env: unknown,
): DirectEditorialRuntime | null {
  if (!env || typeof env !== "object") return null;
  const values = env as Record<string, unknown>;
  if (
    values.EDITORIAL_ENABLED !== "true" ||
    !values.CONTENT_DB ||
    !values.CONTENT_MEDIA ||
    !values.EDITORIAL
  ) {
    // An explicitly selected direct publisher must never fall back to Git.
    if (values.EDITORIAL_DIRECT_PUBLISH_ENABLED === "true")
      throw new Error("direct_publisher_not_configured");
    return null;
  }
  return {
    db: values.CONTENT_DB as PublicationDatabase,
    media: values.CONTENT_MEDIA as DirectPublisherDependencies["media"],
    storage: (
      values.EDITORIAL as { getByName(name: string): EditorialDraftStore }
    ).getByName("production"),
    enabled: values.EDITORIAL_DIRECT_PUBLISH_ENABLED === "true",
    async publicReady() {
      try {
        const response = await fetch("https://anipotts.com/api/health", {
          cache: "no-store",
          signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) return false;
        const data = (await response.json()) as {
          content_runtime?: unknown;
          content_media?: unknown;
        };
        return data.content_runtime === 1 && data.content_media === 1;
      } catch {
        return false;
      }
    },
  };
}
