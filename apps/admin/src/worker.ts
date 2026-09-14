import type { SSRManifest } from "astro";
import { createExports as createAstroExports } from "@astrojs/cloudflare/entrypoints/server.js";
import { EditorialDraftStore } from "./editorial/draft-store";
import { reportRuntimeContract } from "./lib/runtime-contract";

export function createExports(manifest: SSRManifest) {
  const astro = createAstroExports(manifest);
  const fetch: typeof astro.default.fetch = (request, env, context) => {
    // Diagnostic only: Access fronts every route, so no smoke would catch a block.
    reportRuntimeContract(env, "fetch");
    return astro.default.fetch(request, env, context);
  };
  return {
    ...astro,
    default: { ...astro.default, fetch },
    EditorialDraftStore,
  };
}
