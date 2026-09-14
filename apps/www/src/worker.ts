import type { SSRManifest } from "astro";
import { createExports as createAstroExports } from "@astrojs/cloudflare/entrypoints/server.js";
import { withSecurityHeaders } from "./lib/security-headers";

/** Cloudflare Worker entry, named by astro.config.mjs. The adapter answers
 * prerendered pages and manifest assets from env.ASSETS before middleware
 * runs, so the security headers are applied here to every response it returns.
 * Routing, redirects and caching stay exactly as the adapter produces them.
 *
 * That early ASSETS fetch runs outside Astro's error handling. If it throws,
 * the platform error page would carry none of the headers, so a plain 500
 * that does is returned instead. Only the error message is logged, and the
 * response body never includes it.
 */
export function createExports(manifest: SSRManifest) {
  const astro = createAstroExports(manifest);
  const fetch: typeof astro.default.fetch = async (request, env, context) => {
    try {
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
