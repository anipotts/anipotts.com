import type { SSRManifest } from "astro";
import { createExports as createAstroExports } from "@astrojs/cloudflare/entrypoints/server.js";
import { withSecurityHeaders } from "./lib/security-headers";

/** Cloudflare Worker entry, named by astro.config.mjs. The adapter answers
 * prerendered pages and manifest assets from env.ASSETS before middleware
 * runs, so the security headers are applied here to every response it returns.
 * Routing, redirects and caching stay exactly as the adapter produces them.
 */
export function createExports(manifest: SSRManifest) {
  const astro = createAstroExports(manifest);
  const fetch: typeof astro.default.fetch = async (request, env, context) =>
    withSecurityHeaders(await astro.default.fetch(request, env, context));
  return { ...astro, default: { ...astro.default, fetch } };
}
