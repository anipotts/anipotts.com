import type { SSRManifest } from "astro";
import { createExports as createAstroExports } from "@astrojs/cloudflare/entrypoints/server.js";
import { EditorialDraftStore } from "./editorial/draft-store";

export function createExports(manifest: SSRManifest) {
  return { ...createAstroExports(manifest), EditorialDraftStore };
}
