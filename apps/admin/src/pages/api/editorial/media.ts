import type { APIRoute } from "astro";
import { editorialMediaApi } from "../../../lib/editorial-media-api";
import { productionEditor } from "../../../lib/editorial-server";
import { privateJson } from "../../../lib/editorial-security";

export const ALL: APIRoute = async ({ request, locals }) => {
  try {
    const storage = import.meta.env.DEV
      ? await (await import("../../../lib/editorial-local")).localDraftStorage()
      : productionEditor(locals.runtime?.env)?.storage;
    if (!storage) return privateJson({ error: "storage_unavailable" }, 503);
    return await editorialMediaApi(request, storage);
  } catch {
    return privateJson({ error: "storage_unavailable" }, 503);
  }
};
