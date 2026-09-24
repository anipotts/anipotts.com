import { publicSiteUrl } from "./editorial-content";
import { editorialImagePreview } from "./editorial-media";

/** The two draft preview frames the editor embeds. */
export const PREVIEW_PATHS = new Set(["/preview/home", "/preview/record"]);

const PREVIEW_POLICY =
  "sandbox allow-scripts; form-action 'none'; frame-ancestors 'self'; connect-src 'none'";

/**
 * A draft preview renders public components with private content. Existing
 * public assets load from www and links open the public site, so drafts never
 * acquire public URLs, and the frame can neither submit, connect nor escape.
 */
export async function previewResponse(
  response: Response,
  requestUrl: URL,
): Promise<Response> {
  if (response.headers.get("Content-Type")?.includes("text/html")) {
    const html = (await response.text())
      .replace(
        /(src|poster)="(\/(?:images|media|fonts)\/[^"<>]*)"/g,
        (_match, attribute, path) => {
          const preview = editorialImagePreview(path);
          const base =
            preview !== path || import.meta.env.DEV
              ? requestUrl
              : publicSiteUrl;
          return `${attribute}="${new URL(preview, base).href}"`;
        },
      )
      .replace(
        /<a(\s[^>]*?)href="(\/(?!\/)[^"<>]*)"/g,
        (_match, attributes, path) =>
          `<a${attributes}href="${new URL(path, publicSiteUrl).href}"`,
      );
    response = new Response(html, {
      status: response.status,
      headers: response.headers,
    });
  }
  response.headers.set("Content-Security-Policy", PREVIEW_POLICY);
  return response;
}
