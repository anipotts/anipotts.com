import type { APIRoute } from "astro";
import { editorialMediaApi } from "../../../lib/editorial-media-api";
import { productionEditor } from "../../../lib/editorial-server";
import { privateEditorialResponse } from "../../../lib/editorial-security";

export const ALL: APIRoute = async ({ request, locals }) => {
  try {
    const storage = import.meta.env.DEV
      ? await (await import("../../../lib/editorial-local")).localDraftStorage()
      : productionEditor(locals.runtime?.env)?.storage;
    if (!storage)
      return privateEditorialResponse({ error: "storage_unavailable" }, 503);
    return await editorialMediaApi(request, storage);
  } catch {
    return privateEditorialResponse({ error: "storage_unavailable" }, 503);
  }
};
