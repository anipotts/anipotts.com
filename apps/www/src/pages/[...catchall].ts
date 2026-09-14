import type { APIRoute } from "astro";

export const prerender = false;

/** on-demand catch-all. wrangler.toml sets `run_worker_first = true`, so
 *  every request reaches src/worker.ts, which adds the security headers.
 *  the adapter still answers prerendered HTML and static files from ASSETS
 *  before middleware. for paths with no static file, middleware runs first
 *  (handling legacy redirects such as /thoughts and /making), and if it doesn't
 *  redirect, this catchall renders the prerendered 404 page. */
export const GET: APIRoute = async ({ request, locals }) => {
  const notFound = await locals.runtime.env.ASSETS.fetch(
    new URL("/404.html", request.url),
  );
  return new Response(notFound.body, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
};
