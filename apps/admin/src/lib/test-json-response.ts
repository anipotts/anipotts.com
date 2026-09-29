/** Synthetic browser/API fixture with the same JSON media type as production. */
export function jsonResponse(body: BodyInit | null, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type"))
    headers.set("content-type", "application/json");
  return new Response(body, { ...init, headers });
}
