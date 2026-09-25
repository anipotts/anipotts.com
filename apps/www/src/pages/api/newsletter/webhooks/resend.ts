import type { APIRoute } from "astro";
import { json, readBoundedText } from "../../../../lib/api";
import {
  missingDbResponse,
  parseResendWebhook,
  readResendWebhookHeaders,
  recordResendEvent,
  verifyResendWebhook,
  WEBHOOK_BODY_LIMIT_BYTES,
} from "../../../../lib/newsletter";
import { runtimeEnv } from "../../../../lib/runtime-env";

export const prerender = false;

const SUPPRESSION_EVENTS = new Set([
  "email.bounced",
  "email.complained",
  "email.suppressed",
]);

export const POST: APIRoute = async ({ request, locals }) => {
  const env = runtimeEnv(locals);
  if (!env.DB) return missingDbResponse();
  if (!env.RESEND_WEBHOOK_SECRET) {
    return json({ error: "resend webhook not configured" }, 501);
  }

  const headers = readResendWebhookHeaders(request);
  if (!headers) return json({ error: "invalid webhook headers" }, 400);

  const rawBody = await readBoundedText(request, WEBHOOK_BODY_LIMIT_BYTES);
  if (rawBody === null) return json({ error: "payload too large" }, 413);

  const verified = await verifyResendWebhook(
    headers,
    env.RESEND_WEBHOOK_SECRET,
    rawBody,
  );
  if (!verified) return json({ error: "invalid signature" }, 401);

  const payload = parseResendWebhook(rawBody);
  if (!payload) return json({ error: "invalid payload" }, 400);

  try {
    await recordResendEvent(env.DB, {
      type: payload.type,
      email: payload.data?.to?.[0]?.trim().toLowerCase() || null,
      providerEventId: headers.id,
      providerEmailId: payload.data?.email_id ?? null,
      suppressionReason: SUPPRESSION_EVENTS.has(payload.type)
        ? payload.type.replace("email.", "")
        : null,
      payload,
    });
  } catch (error) {
    console.error("newsletter webhook error", error);
    return json({ error: "internal server error" }, 500);
  }

  return json({ success: true });
};
