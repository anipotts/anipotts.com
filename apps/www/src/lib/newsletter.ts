import type { APIRoute } from "astro";

/** Public URL compatibility only. Storage and delivery belong to the worker. */
export const forwardNewsletter: APIRoute = async ({ request, locals }) => {
  const service = locals.runtime.env.NEWSLETTER;
  if (!service)
    return Response.json({ error: "newsletter unavailable" }, { status: 503 });

  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("authorization");
  headers.set(
    "x-newsletter-client-ip",
    request.headers.get("cf-connecting-ip")?.trim() || "unknown",
  );
  try {
    // Read first so an early rejection cannot outlive the request stream.
    const body = await requestBody(request);
    const response = await service.fetch(
      new Request(request.url, {
        method: request.method,
        headers,
        body,
      }),
    );
    const result = new Response(response.body, response);
    result.headers.set("cache-control", "no-store");
    return result;
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "newsletter unavailable" }, { status: 503 });
  }
};

async function requestBody(request: Request): Promise<ArrayBuffer | undefined> {
  if (!request.body) return undefined;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 1024 * 1024) {
      await reader.cancel();
      throw Response.json(
        { error: "request too large" },
        { status: 413, headers: { "cache-control": "no-store" } },
      );
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}
