import type { APIRoute } from "astro";
import {
  saveDraftOperation,
  statusError,
  type DraftOperationSaveInput,
} from "../../../../lib/content-draft-operation";
import { requireAdminMutation } from "../../../../lib/admin-auth";
import {
  COMPATIBILITY_JSON_LIMITS,
  CompatibilityJsonError,
  readCompatibilityJson,
} from "../../../../lib/admin-compatibility-request";

export const POST: APIRoute = async (context) => {
  try {
    await requireAdminMutation(context, "draft:save");

    const db = context.locals.runtime?.env.DB;
    if (!db) {
      throw statusError(503, "db_binding_missing");
    }

    const contentType = context.request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw statusError(415, "json_required");
    }

    const body = (await readCompatibilityJson(
      context.request,
      COMPATIBILITY_JSON_LIMITS.draftOperation,
    )) as DraftOperationSaveInput;
    return Response.json(await saveDraftOperation(db, body), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof CompatibilityJsonError) {
      return statusError(error.status, error.code);
    }
    return statusError(400, "draft_save_failed");
  }
};
