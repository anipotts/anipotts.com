import type { APIRoute } from "astro";

export const prerender = false;

export const GET: APIRoute = async () => {
  return Response.json({
    app: "www",
    ok: true,
    release_sha: import.meta.env.PUBLIC_RELEASE_SHA || "dev",
    ts: new Date().toISOString(),
  });
};
