import type { APIRoute } from "astro";
import { privateReaderCredentialApi } from "../../../lib/private-reader-credential";
import { privateJson } from "../../../lib/editorial-security";

export const ALL: APIRoute = async ({ request, locals }) => {
  try {
    return await privateReaderCredentialApi(request, locals.runtime?.env ?? {});
  } catch {
    return privateJson({ error: "reader_unavailable" }, 503);
  }
};
