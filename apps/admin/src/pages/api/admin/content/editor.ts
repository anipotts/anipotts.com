import type { APIRoute } from "astro";
import {
  publishEditorDraft,
  saveEditorDraft,
  statusError,
  type ContentEditorPublishInput,
  type ContentEditorSaveInput,
} from "../../../../lib/content-editor";
import { requireAdminMutation } from "../../../../lib/admin-auth";
import {
  COMPATIBILITY_JSON_LIMITS,
  CompatibilityJsonError,
  readCompatibilityJson,
} from "../../../../lib/admin-compatibility-request";

export const POST: APIRoute = async (context) => {
  try {
    const db = context.locals.runtime?.env.DB;
    if (!db) throw statusError(503, "db_binding_missing");

    const contentType = context.request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw statusError(415, "json_required");
    }

    const body = (await readCompatibilityJson(
      context.request,
      COMPATIBILITY_JSON_LIMITS.contentEditor,
    )) as ContentEditorSaveInput | ContentEditorPublishInput | null;
    const principal = await requireAdminMutation(
      context,
      body?.action === "publish" ? "content:publish" : "draft:save",
    );
    const actor = {
      id: principal.userId,
      display_name: principal.displayName,
      credential_id_hint: principal.credentialId?.slice(-8) ?? null,
    };

    if (body?.action === "save_draft") {
      return Response.json(await saveEditorDraft(db, body, actor), {
        headers: { "cache-control": "no-store" },
      });
    }

    if (body?.action === "publish") {
      return Response.json(await publishEditorDraft(db, body, actor), {
        headers: { "cache-control": "no-store" },
      });
    }

    throw statusError(400, "unknown_editor_action");
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof CompatibilityJsonError) {
      return statusError(error.status, error.code);
    }
    return statusError(400, "content_editor_failed");
  }
};
