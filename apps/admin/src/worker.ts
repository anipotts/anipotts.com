import { handle } from "@astrojs/cloudflare/handler";
import {
  isHashedAssetRequest,
  withHashedAssetCache,
} from "./lib/hashed-assets";
import { reportRuntimeContract } from "./lib/runtime-contract";
import { isViteDevRequest } from "../../www/src/lib/vite-dev-request";

import {
  deniedAdminOrigin,
  isAdminRequestOriginAllowed,
} from "./lib/admin-request-origin";

export { EditorialDraftStore } from "./editorial/draft-store";

type Handler = typeof handle;

// Only existing, non-sensitive public files. Astro 7's dev route matcher selects
// our custom 404 before the adapter can fall back to Vite's public directory.
// Keep this separate from public route admission and out of production routing.
const DEV_PUBLIC_ASSETS = new Set([
  "/admin-bracket.svg",
  "/apple-touch-icon.png",
  "/favicon.svg",
  "/favicon-light.svg",
  "/favicon-dark.svg",
  "/favicon-light-32.png",
  "/favicon-dark-32.png",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/manifest.webmanifest",
]);

/** Cloudflare Worker entry, named by `main` in wrangler.toml. It wraps the
 * adapter handler and exports the editorial Durable Object class. */
const fetch: Handler = async (request, env, context) => {
  if (
    !isAdminRequestOriginAllowed(
      request,
      import.meta.env.DEV,
      __LOCAL_OWNER_BUILD__,
    )
  )
    return deniedAdminOrigin();
  // Development only: Vite's module/client URLs and exact public files.
  if (
    import.meta.env.DEV &&
    (isViteDevRequest(request) ||
      ((request.method === "GET" || request.method === "HEAD") &&
        DEV_PUBLIC_ASSETS.has(new URL(request.url).pathname)))
  )
    return env.ASSETS.fetch(
      request as unknown as Parameters<typeof env.ASSETS.fetch>[0],
    );
  // Diagnostic only: Access fronts every route, so no smoke would catch a block.
  reportRuntimeContract(env, "fetch");
  // Adapter 14's passthrough /_image endpoint would read any same-origin href
  // from ASSETS. Admin never emits /_image URLs, so it answers 404.
  const { pathname } = new URL(request.url);
  if (pathname === "/_image" || pathname.startsWith("/_image/"))
    return new Response(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  // Hashed build output skips the adapter, which would drop the request's
  // validators, and takes the long-lived cache policy. A miss or any
  // failure falls through to the adapter, which keeps the 404 page.
  if (isHashedAssetRequest(request)) {
    try {
      // The same request object: the adapter's Request type and the ASSETS
      // Fetcher type come from different workers type sets.
      const asset = await env.ASSETS.fetch(
        request as unknown as Parameters<typeof env.ASSETS.fetch>[0],
      );
      if (asset.ok || asset.status === 304) return withHashedAssetCache(asset);
    } catch {
      /* The adapter answers below. */
    }
  }
  return handle(request, env, context);
};

export default { fetch };
