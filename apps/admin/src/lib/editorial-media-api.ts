import type { EditorialDraftStore } from "../editorial/draft-store";
import { MAX_MEDIA_BYTES } from "../editorial/media-store";
import {
  checkEditorialMutation,
  privateEditorialResponse,
  readEditorialJson,
} from "./editorial-security";

export type MediaStorage = Pick<EditorialDraftStore, "saveMedia" | "readMedia">;

/** The editorial namespace middleware verifies the owner before this handler. */
export async function editorialMediaApi(
  request: Request,
  storage: MediaStorage,
) {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const file = await storage.readMedia(url.searchParams.get("id") ?? "");
    if (!file)
      return privateEditorialResponse({ error: "image_not_found" }, 404);
    const headers = new Headers(privateEditorialResponse(null).headers);
    headers.set("Content-Type", file.metadata.type);
    headers.set("Content-Length", String(file.bytes.length));
    headers.set(
      "Content-Disposition",
      `inline; filename="${file.metadata.id}"`,
    );
    return new Response(new Uint8Array(file.bytes), { headers });
  }
  if (request.method !== "POST")
    return privateEditorialResponse({ error: "method_not_allowed" }, 405);
  const rejection = checkEditorialMutation(request, url.origin);
  if (rejection) return privateEditorialResponse({ error: rejection }, 403);
  let body: unknown;
  try {
    body = await readEditorialJson(
      request,
      Math.ceil(MAX_MEDIA_BYTES / 3) * 4 + 1024,
    );
  } catch {
    return privateEditorialResponse({ error: "invalid_upload" }, 400);
  }
  if (
    !body ||
    typeof body !== "object" ||
    !("base64" in body) ||
    typeof body.base64 !== "string"
  )
    return privateEditorialResponse({ error: "invalid_upload" }, 400);
  const bytes = Buffer.from(body.base64, "base64");
  if (bytes.toString("base64") !== body.base64)
    return privateEditorialResponse({ error: "invalid_upload" }, 400);
  const result = await storage.saveMedia(new Uint8Array(bytes));
  return privateEditorialResponse(result, result.ok ? 201 : 400);
}
