import type { APIRoute } from "astro";
import { json } from "../../../../lib/api";
import {
  missingDbResponse,
  parseJsonBody,
  recordNewsletterEvent,
  suppressEmail,
  verifyResendWebhook,
} from "../../../../lib/newsletter";

export const prerender = false;

type ResendWebhook = {
  type?: string;
  created_at?: string;
  data?: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    tags?: { name: string; value: string }[];
  };
};

const SUPPRESSION_EVENTS = new Set([
  "email.bounced",
  "email.complained",
  "email.suppressed",
]);

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  if (!env.DB) return missingDbResponse();
  if (!env.RESEND_WEBHOOK_SECRET) {
    return json({ error: "resend webhook not configured" }, 501);
  }

  const rawBody = await request.text();
  const verified = await verifyResendWebhook(
    request,
    env.RESEND_WEBHOOK_SECRET,
    rawBody,
  );
  if (!verified) return json({ error: "invalid signature" }, 401);

  const payload = parseJsonBody(rawBody) as ResendWebhook | null;
  if (!payload?.type) return json({ error: "invalid payload" }, 400);

  const providerEventId = request.headers.get("svix-id");
  const email = payload.data?.to?.[0]?.trim().toLowerCase() ?? null;
  const providerEmailId = payload.data?.email_id ?? null;

  await recordNewsletterEvent(env.DB, {
    type: payload.type,
    email,
    provider: "resend",
    providerEventId,
    providerEmailId,
    payload,
  });

  if (email && SUPPRESSION_EVENTS.has(payload.type)) {
    await suppressEmail(env.DB, {
      email,
      reason: payload.type.replace("email.", ""),
      provider: "resend",
      providerEventId,
      payload,
    });
  }

  return json({ success: true });
};
