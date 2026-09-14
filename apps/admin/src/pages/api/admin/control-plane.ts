import type { APIRoute } from "astro";
import {
  readControlPlane,
  submitControlPlaneProof,
} from "../../../data/control-plane";
import { requireAdminMutation } from "../../../lib/admin-auth";
import {
  boundedErrorCode,
  COMPATIBILITY_JSON_LIMITS,
  CompatibilityJsonError,
  readCompatibilityJson,
} from "../../../lib/admin-compatibility-request";
import { statusError } from "../../../lib/content-draft-operation";

const CONTROL_COMMAND_CODES = new Set([
  "relay_binding_missing",
  "invalid_control_command_request",
]);

export const GET: APIRoute = async (context) => {
  try {
    if (!context.locals.adminPrincipal && !import.meta.env.DEV) {
      throw statusError(401, "admin_session_required");
    }
    const state = await readControlPlane(
      context.locals.runtime?.env.COMMAND_RELAY,
      8,
    );
    return Response.json(state, {
      status: state.available ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return statusError(503, "control_plane_read_failed");
  }
};

export const POST: APIRoute = async (context) => {
  try {
    const principal = await requireAdminMutation(context, "control:execute");
    const contentType = context.request.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      throw statusError(415, "json_required");
    }
    const body = (await readCompatibilityJson(
      context.request,
      COMPATIBILITY_JSON_LIMITS.controlCommand,
    )) as {
      idempotency_key?: unknown;
      reason?: unknown;
    } | null;
    if (
      !body ||
      typeof body.idempotency_key !== "string" ||
      typeof body.reason !== "string"
    ) {
      throw statusError(400, "invalid_control_command_request");
    }
    const command = await submitControlPlaneProof(
      context.locals.runtime?.env.COMMAND_RELAY,
      {
        actorId: principal.userId,
        idempotencyKey: body.idempotency_key,
        reason: body.reason,
      },
    );
    return Response.json(command, {
      status: command.state === "queued" ? 202 : 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof CompatibilityJsonError) {
      return statusError(
        error.status,
        error.status === 413 ? "control_command_too_large" : error.code,
      );
    }
    return statusError(
      400,
      error instanceof Error
        ? boundedErrorCode(
            error.message,
            "control_command_failed",
            CONTROL_COMMAND_CODES,
          )
        : "control_command_failed",
    );
  }
};
