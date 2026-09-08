import type { APIRoute } from "astro";
import { checkOrigin, checkRateLimit, json } from "../../../lib/api";
import {
  createDoubleOptIn,
  missingDbResponse,
  normalizeEmail,
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

    const parsed = subscribePayloadSchema.safeParse(await request.json());
    if (!parsed.success) return json({ error: "valid email required" }, 400);

    const result = await createDoubleOptIn(
      env,
      request,
      normalizeEmail(parsed.data.email),
    );
    return json({ success: true, queued: result.queued, mock: result.mock });
  } catch (error) {
    console.error("newsletter subscribe error", error);
    return json({ error: "internal server error" }, 500);
  }
};
