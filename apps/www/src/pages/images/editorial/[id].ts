import type { APIRoute } from "astro";
import { publicContentContext } from "../../../lib/content";
import { hasPublishedMedia, publicMediaId } from "../../../lib/published-media";
export const prerender = false;
export const GET: APIRoute = async ({ params, locals, request }) => {
  const id = params.id ?? "";
  if (!publicMediaId.test(id))
    return new Response("Not found", { status: 404 });
  const env = locals.runtime?.env;
  // Existing build assets were already explicitly published through Git.
  if (env?.ASSETS) {
    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
  }
  const publications = await publicContentContext(locals).publications;
  if (!hasPublishedMedia(publications, id))
    return new Response("Not found", {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  if (!env?.CONTENT_MEDIA)
    return new Response("Media unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  const object = await env.CONTENT_MEDIA.get(id);
  if (!object)
    return new Response("Media unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  return new Response(object.body, {
    headers: {
      "Content-Type": id.endsWith(".jpg")
        ? "image/jpeg"
        : id.endsWith(".png")
          ? "image/png"
          : "image/webp",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ETag: object.httpEtag,
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
