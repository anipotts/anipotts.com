import type { APIRoute } from "astro";
import {
  checkOrigin,
  checkRateLimit,
  json,
  readBoundedText,
} from "../../../lib/api";
import {
  createDoubleOptIn,
  missingDbResponse,
  normalizeEmail,
  parseJsonBody,
  SUBSCRIBE_BODY_LIMIT_BYTES,
  subscribePayloadSchema,
} from "../../../lib/newsletter";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const forbidden = checkOrigin(request);
    if (forbidden) return forbidden;

    const env = locals.runtime.env;
    if (!env.DB) return missingDbResponse();

    const allowed = await checkRateLimit(request, env.DB);
    if (!allowed) return json({ error: "too many requests" }, 429);

    const body = await readBoundedText(request, SUBSCRIBE_BODY_LIMIT_BYTES);
    if (body === null) return json({ error: "payload too large" }, 413);

    const parsed = subscribePayloadSchema.safeParse(parseJsonBody(body));
    if (!parsed.success) return json({ error: "valid email required" }, 400);

    // One response for every address state; see createDoubleOptIn.
    await createDoubleOptIn(env, request, normalizeEmail(parsed.data.email));
    return json({ success: true });
  } catch (error) {
    console.error("newsletter subscribe error", error);
    return json({ error: "internal server error" }, 500);
  }
};
