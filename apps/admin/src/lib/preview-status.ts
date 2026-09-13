export type PreviewStatus =
  "ready" | "unavailable" | "stale" | "invalid-source" | "source-only";
export const previewStatusType = "editorial-preview-status";
export function previewRequest(url: URL): string {
  const value = url.searchParams.get("previewRequest") ?? "";
  return value.length <= 4096 ? value : "";
}
/** No draft contents or arbitrary exception text enter the cross-frame contract. */
export function previewFailure(
  url: URL,
  status: Exclude<PreviewStatus, "ready">,
  code: number,
): Response {
  const message = JSON.stringify({
    type: previewStatusType,
    request: previewRequest(url),
    status,
  }).replace(/</g, "\\u003c");
  return new Response(
    `<!doctype html><html lang="en"><meta name="robots" content="noindex,nofollow"><title>Preview unavailable</title><body><p>This preview is unavailable. Return to the editor to review its status.</p><script>parent.postMessage(${message},"*")</script></body></html>`,
    {
      status: code,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
