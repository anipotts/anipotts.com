import type { SSRManifest } from "astro";
import { createExports as createAstroExports } from "@astrojs/cloudflare/entrypoints/server.js";
import { withSecurityHeaders } from "./lib/security-headers";
import { isStaticAssetPath, withStaticCacheControl } from "./lib/static-assets";

/** Cloudflare Worker entry, named by astro.config.mjs. The adapter answers
 * prerendered pages and manifest assets from env.ASSETS before middleware
 * runs, so the security headers are applied here to every response it returns.
 * Routing and redirects stay exactly as the adapter produces them.
 *
 * That early ASSETS fetch runs outside Astro's error handling. If it throws,
 * the platform error page would carry none of the headers, so a plain 500
 * that does is returned instead. Only the error message is logged, and the
 * response body never includes it.
 *
 * GET and HEAD for static files skip the adapter and pass the original
 * request to env.ASSETS, so If-None-Match reaches the assets service and a
 * matching validator gets a 304. Their Cache-Control follows the class policy
 * in lib/static-assets. A 404 falls through to the adapter, which keeps the
 * site 404 page for missing files.
 */
export function createExports(manifest: SSRManifest) {
  const astro = createAstroExports(manifest);
  const fetch: typeof astro.default.fetch = async (request, env, context) => {
    try {
      const { pathname } = new URL(request.url);
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        isStaticAssetPath(pathname)
      ) {
        // The same request object. The adapter's handler type and the ASSETS
        // Fetcher type come from different workers type sets.
        const asset = await env.ASSETS.fetch(
          request as unknown as Parameters<typeof env.ASSETS.fetch>[0],
        );
        if (asset.ok || asset.status === 304) {
          return withSecurityHeaders(withStaticCacheControl(pathname, asset));
        }
      }
      return withSecurityHeaders(
        await astro.default.fetch(request, env, context),
      );
    } catch (error) {
      console.error(
        "www worker fetch failed:",
        error instanceof Error ? error.message : String(error),
      );
      return withSecurityHeaders(
        new Response("internal error", {
          status: 500,
          headers: {
            "cache-control": "no-store",
            "content-type": "text/plain; charset=utf-8",
          },
        }),
      );
    }
  };
  return { ...astro, default: { ...astro.default, fetch } };
}
