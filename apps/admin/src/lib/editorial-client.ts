import { editorialResponseLimit } from "./editorial-response-bounds";
import { protectedAdminJson } from "./protected-admin-json";
import { discardBody } from "./response-body";

/** Browser side of the editorial boundary: the same-origin CSRF token that
 * every owner write and credential issuance carries. */
export async function readEditorialCsrf(signal?: AbortSignal): Promise<string> {
  const response = await protectedAdminJson("/api/editorial/csrf", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    discardBody(response);
    throw new Error("CSRF unavailable");
  }
  const body = (await response.json()) as { csrf?: unknown };
  if (typeof body.csrf !== "string") throw new Error("CSRF unavailable");
  return body.csrf;
}

/** Source-bearing editorial responses use the server's bounded record/history
 * contracts. CSRF, reader issuance and publication status keep the default. */
export function editorialAdminJson(
  input: string,
  init: RequestInit = {},
  fetcher: typeof fetch = globalThis.fetch,
): Promise<Response> {
  return protectedAdminJson(input, init, fetcher, {
    maxBytes: editorialResponseLimit(input),
  });
}
