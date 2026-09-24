import type { SSRManifest } from "astro";
import { createExports as createAstroExports } from "@astrojs/cloudflare/entrypoints/server.js";
import { EditorialDraftStore } from "./editorial/draft-store";
import {
  isHashedAssetRequest,
  withHashedAssetCache,
} from "./lib/hashed-assets";
import { reportRuntimeContract } from "./lib/runtime-contract";

export function createExports(manifest: SSRManifest) {
  const astro = createAstroExports(manifest);
  const fetch: typeof astro.default.fetch = async (request, env, context) => {
    // Diagnostic only: Access fronts every route, so no smoke would catch a block.
    reportRuntimeContract(env, "fetch");
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
        if (asset.ok || asset.status === 304)
          return withHashedAssetCache(asset);
      } catch {
        /* The adapter answers below. */
      }
    }
    return astro.default.fetch(request, env, context);
  };
  return {
    ...astro,
    default: { ...astro.default, fetch },
    EditorialDraftStore,
  };
}
