import { handle } from "@astrojs/cloudflare/handler";
import {
  isHashedAssetRequest,
  withHashedAssetCache,
} from "./lib/hashed-assets";
import { reportRuntimeContract } from "./lib/runtime-contract";
import { isViteDevRequest } from "../../www/src/lib/vite-dev-request";

export { EditorialDraftStore } from "./editorial/draft-store";

type Handler = typeof handle;

/** Cloudflare Worker entry, named by `main` in wrangler.toml. It wraps the
 * adapter handler and exports the editorial Durable Object class. */
const fetch: Handler = async (request, env, context) => {
  // Development only: Vite's module and client URLs (see vite-dev-request).
  if (import.meta.env.DEV && isViteDevRequest(request))
    return env.ASSETS.fetch(
      request as unknown as Parameters<typeof env.ASSETS.fetch>[0],
    );
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
      if (asset.ok || asset.status === 304) return withHashedAssetCache(asset);
    } catch {
      /* The adapter answers below. */
    }
  }
  return handle(request, env, context);
};

export default { fetch };
