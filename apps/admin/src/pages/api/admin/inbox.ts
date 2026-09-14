import type { APIRoute } from "astro";
import {
  AdminInboxWriteError,
  writeAdminInboxAttention,
} from "@anipotts/lib/admin-control";
import { readAdminInbox } from "../../../data/inbox";
import { statusError } from "../../../lib/content-draft-operation";
import { requireAdminMutation } from "../../../lib/admin-auth";
import {
  boundedErrorCode,
  COMPATIBILITY_JSON_LIMITS,
  CompatibilityJsonError,
  readCompatibilityJson,
} from "../../../lib/admin-compatibility-request";

export const GET: APIRoute = async (context) => {
  const inbox = await readAdminInbox(context.locals.runtime?.env.DB);
  return Response.json(inbox, {
    headers: { "cache-control": "no-store" },
  });
};

export const POST: APIRoute = async (context) => {
  try {
    const db = context.locals.runtime?.env.DB;
    if (!db) throw statusError(503, "db_binding_missing");

    const contentType = context.request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw statusError(415, "json_required");
    }

    const actor = await requireAdminMutation(context, "action:stage");
    const body = await readCompatibilityJson(
      context.request,
      COMPATIBILITY_JSON_LIMITS.inboxAttention,
    );
    const result = await writeAdminInboxAttention(
      db,
      body,
      `passkey:${actor.userId}`,
    );
    return Response.json(result, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof CompatibilityJsonError) {
      return statusError(error.status, error.code);
    }
    if (error instanceof AdminInboxWriteError) {
      return statusError(
        error.status,
        boundedErrorCode(error.message, "inbox_write_failed"),
      );
    }
    return statusError(400, "inbox_write_failed");
  }
};
