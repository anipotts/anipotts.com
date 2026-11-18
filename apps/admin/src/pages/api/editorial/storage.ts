import type { APIRoute } from "astro";
import { privateJson } from "../../../lib/editorial-security";
import { productionEditor } from "../../../lib/editorial-server";
import { runtimeEnv } from "../../../lib/runtime-env";

/** Owner middleware covers the editorial namespace. Counts only, never source. */
export const GET: APIRoute = async () => {
  try {
    const runtime = productionEditor(runtimeEnv());
    if (!runtime) return privateJson({ error: "editor_not_configured" }, 503);
    return privateJson(await runtime.storage.draftStorageStatus());
  } catch {
    return privateJson({ error: "storage_unavailable" }, 503);
  }
};
