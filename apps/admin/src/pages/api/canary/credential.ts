import type { APIRoute } from "astro";
import { privateJson } from "../../../lib/editorial-security";
import { privateReaderCanaryApi } from "../../../lib/private-reader-canary";

/** The reader canary's credential. Middleware passes this one path through;
 * the handler verifies the canary service token itself. */
export const ALL: APIRoute = async ({ request, locals }) => {
  try {
    return await privateReaderCanaryApi(request, locals.runtime?.env ?? {});
  } catch {
    return privateJson({ error: "reader_unavailable" }, 503);
  }
};
