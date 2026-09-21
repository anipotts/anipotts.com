import type { APIRoute } from "astro";
import { privateReaderCredentialApi } from "../../../lib/private-reader-credential";
import { privateEditorialResponse } from "../../../lib/editorial-security";

/** Issues an `ops:read`-only reader credential for Observability Status. */
export const ALL: APIRoute = async ({ request, locals }) => {
  try {
    return await privateReaderCredentialApi(
      request,
      locals.runtime?.env ?? {},
      {},
      "ops",
    );
  } catch {
    return privateEditorialResponse({ error: "reader_unavailable" }, 503);
  }
};
