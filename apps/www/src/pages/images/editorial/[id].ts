import type { APIRoute } from "astro";
import {
  publicMediaReference,
  publicMediaId,
} from "../../../lib/published-media";
import {
  publicContentContext,
  publicVersionHeaders,
  contentUnavailable,
} from "../../../lib/published-runtime";
import { runtimeEnv } from "../../../lib/runtime-env";
export const prerender = false;
export const GET: APIRoute = async ({ params, locals, request }) => {
  const context = publicContentContext(locals);
  const id = params.id ?? "";
  if (!publicMediaId.test(id))
    return new Response("Not found", { status: 404 });
  const reference = await publicMediaReference(context, id);
  if (!reference) return new Response("Not found", { status: 404 });
  // Bundled media is available only after its current public reference passes.
  // Never let a stale asset bypass an unpublished or replaced record.
  const asset = await runtimeEnv(locals).ASSETS.fetch(request);
  if (asset.ok) return asset;
  const bucket = runtimeEnv(locals).CONTENT_MEDIA;
  if (!bucket) return contentUnavailable();
  const object = await bucket.get(id);
  if (!object) return contentUnavailable();
  const { version } = await context.inventory;
  return new Response(object.body, {
    headers: {
      ...publicVersionHeaders(version),
      "Content-Type": id.endsWith(".jpg")
        ? "image/jpeg"
        : id.endsWith(".png")
          ? "image/png"
          : "image/webp",
      "Content-Length": String(object.size),
    },
  });
};

export const HEAD: APIRoute = async (context) => {
  const response = await GET(context);
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
};
