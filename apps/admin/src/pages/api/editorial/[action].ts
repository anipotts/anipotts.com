import type { APIRoute } from "astro";
import { homeEditorApi } from "../../../lib/editorial-home-api";
import { privateJson } from "../../../lib/editorial-security";
import { productionEditor } from "../../../lib/editorial-server";
import { measureServerTiming } from "../../../lib/server-timing";
import { runtimeEnv } from "../../../lib/runtime-env";

export const ALL: APIRoute = async ({ request, locals }) => {
  try {
    if (!import.meta.env.DEV) {
      const runtime = productionEditor(runtimeEnv());
      if (!runtime) return privateJson({ error: "editor_not_configured" }, 503);
      return await measureServerTiming(locals, "record", () =>
        homeEditorApi(request, runtime.storage, runtime.readBase, {
          storage: runtime.storage,
          enabled: runtime.publishing,
        }),
      );
    }
    const { localDraftStorage, localHomeBase } =
      await import("../../../lib/editorial-local");
    return await measureServerTiming(locals, "record", async () =>
      homeEditorApi(request, await localDraftStorage(), localHomeBase),
    );
  } catch {
    return privateJson({ error: "storage_unavailable" }, 503);
  }
};
