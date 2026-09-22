import type { APIRoute } from "astro";
import { bundledEditorialSourceHash } from "../../lib/bundled-sources";
import { editorialRecordSchema } from "@anipotts/content/editorial/source";
import { CONTENT_SCHEMA_VERSION } from "@anipotts/content/editorial/publication-contract";
import {
  publicContentContext,
  publicationFor,
  publicationIsVisible,
  publicVersionHeaders,
} from "../../lib/published-runtime";
export const prerender = false;
export const GET: APIRoute = async ({ locals, url }) => {
  const context = publicContentContext(locals);
  const { version } = await context.inventory;
  const capabilities = {
    runtime: 1,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    inventoryVersion: version,
    bundledSourceSha256: await bundledEditorialSourceHash(),
  };
  if (!url.searchParams.has("kind") && !url.searchParams.has("id"))
    return Response.json(capabilities, {
      headers: publicVersionHeaders(version),
    });
  const record = editorialRecordSchema.safeParse({
    kind: url.searchParams.get("kind"),
    id: url.searchParams.get("id"),
  });
  if (!record.success)
    return Response.json(
      { error: "invalid_record" },
      { status: 400, headers: publicVersionHeaders(version) },
    );
  const publication = await publicationFor(context, record.data);
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
