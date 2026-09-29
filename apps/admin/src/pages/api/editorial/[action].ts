import type { APIRoute } from "astro";
import { homeEditorApi } from "../../../lib/editorial-home-api";
import { privateEditorialResponse } from "../../../lib/editorial-security";
import { productionEditor } from "../../../lib/editorial-server";
import {
  directEditorialApi,
  directEditorialRuntime,
} from "../../../lib/editorial-direct-api";
import {
  editorialHandoffApi,
  acknowledgePublicationApi,
} from "../../../lib/editorial-handoff-api";
import { readPublishedBase } from "../../../lib/editorial-published-base";

export const ALL: APIRoute = async ({ request, locals }) => {
  try {
    if (!import.meta.env.DEV) {
      const direct = directEditorialRuntime(locals.runtime?.env);
      if (direct && new URL(request.url).pathname.endsWith("/handoff"))
        return await editorialHandoffApi(request, {
          storage: direct.storage,
          readBase: (record) => readPublishedBase(direct.db, record),
        });
      if (direct) return await directEditorialApi(request, direct);
      const runtime = productionEditor(locals.runtime?.env);
      if (!runtime)
        return privateEditorialResponse(
          { error: "editor_not_configured" },
          503,
        );
      return await homeEditorApi(request, runtime.storage, runtime.readBase, {
        storage: runtime.storage,
        enabled: runtime.publishing,
      });
    }
    const { localDraftStorage, localHomeBase } =
      await import("../../../lib/editorial-local");
    if (new URL(request.url).pathname.endsWith("/ack-publication"))
      return await acknowledgePublicationApi(
        request,
        await localDraftStorage(),
      );
    return await homeEditorApi(
      request,
      await localDraftStorage(),
      localHomeBase,
    );
  } catch {
    return privateEditorialResponse({ error: "storage_unavailable" }, 503);
  }
};
