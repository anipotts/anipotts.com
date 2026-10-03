import type { APIRoute } from "astro";
import { getPublishedRecord } from "@anipotts/content/editorial/direct-publication";
import { runtimeEnv } from "../../lib/runtime-env";
import { editorialRecordSchema } from "@anipotts/content/editorial/source";
import { CONTENT_SCHEMA_VERSION } from "@anipotts/content/editorial/publication-contract";
import {
  publicContentContext,
  publicationIsVisible,
  publicVersionHeaders,
} from "../../lib/published-runtime";
export const prerender = false;
export const GET: APIRoute = async ({ locals, url }) => {
  const context = publicContentContext(locals);
  const recordRequest =
    url.searchParams.has("kind") || url.searchParams.has("id");
  const record = editorialRecordSchema.safeParse({
    kind: url.searchParams.get("kind"),
    id: url.searchParams.get("id"),
  });
  const env = runtimeEnv(locals);
  const identity =
    recordRequest &&
    record.success &&
    env?.CONTENT_RUNTIME === "cms" &&
    env.CONTENT_DB
      ? await getPublishedRecord(env.CONTENT_DB, record.data)
      : null;
  const version = identity?.version ?? (await context.version);
  const capabilities = {
    runtime: 2,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    inventoryVersion: version,
  };
  if (!url.searchParams.has("kind") && !url.searchParams.has("id"))
    return Response.json(capabilities, {
      headers: publicVersionHeaders(version),
    });
  if (!record.success)
    return Response.json(
      { error: "invalid_record" },
      { status: 400, headers: publicVersionHeaders(version) },
    );
  const publication = identity?.publication;
  if (!publication || !publicationIsVisible(context, publication))
    return Response.json(
      { ...capabilities, visible: false },
      { headers: publicVersionHeaders(version) },
    );
  return Response.json(
    {
      ...capabilities,
      visible: true,
      publicationId: publication.publicationId,
      sourceSha256: publication.sourceSha256,
    },
    { headers: publicVersionHeaders(version) },
  );
};
