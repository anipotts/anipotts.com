import { siteConfig } from "@anipotts/content/public/site";
import { publicSiteUrl } from "./editorial-content";
import { editorialImagePreview } from "./editorial-media";

/** The two draft preview frames the editor embeds. */
export const PREVIEW_PATHS = new Set(["/preview/home", "/preview/record"]);
export const STANDALONE_PREVIEW_PATH = "/preview/standalone";

/** Browser fetch metadata prevents a raw-mode URL pasted into a tab from
 * becoming an unfenced private document. The editor opts in explicitly. */
export function isEmbeddedPreviewRequest(request: Request, url: URL): boolean {
  return (
    (request.method === "GET" || request.method === "HEAD") &&
    url.searchParams.get("embedded") === "1" &&
    request.headers.get("Sec-Fetch-Dest") === "iframe"
  );
}

export function standalonePreviewUrl(url: URL): URL {
  const outer = new URL(STANDALONE_PREVIEW_PATH, url);
  outer.search = url.search;
  outer.searchParams.delete("embedded");
  outer.searchParams.set("previewPath", url.pathname);
  return outer;
}

/** Only the two owner preview routes can become a frame. No external URL,
 * arbitrary Admin route or nested standalone wrapper is accepted. */
export function standalonePreviewFrameUrl(url: URL): URL | null {
  const path = url.searchParams.get("previewPath");
  if (!path || !PREVIEW_PATHS.has(path)) return null;
  const frame = new URL(path, url);
  frame.search = url.search;
  frame.searchParams.delete("previewPath");
  frame.searchParams.set("embedded", "1");
  return frame;
}

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
      // A self-sizing frame must follow content height, not its own viewport.
      // Otherwise loading large images can permanently inflate the preview.
      .replace("</head>", "<style>body{min-height:0}</style></head>")
      .replace(
        /(src|poster)="(\/(?:images|media|fonts|brand)\/[^"<>]*)"/g,
        (_match, attribute, path) => {
          const preview = editorialImagePreview(path);
          const base = preview !== path ? requestUrl : siteConfig.url;
          return `${attribute}="${new URL(preview, base).href}"`;
        },
      )
      .replace(/srcset="([^"<>]*)"/g, (_match, sources) => {
        const resolved = sources.replace(
          /(^|,\s*)(\/(?:images|media|fonts|brand)\/[^\s,]+)/g,
          (_entry: string, separator: string, path: string) => {
            const preview = editorialImagePreview(path);
            const base = preview !== path ? requestUrl : siteConfig.url;
            return separator + new URL(preview, base).href;
          },
        );
        return `srcset="${resolved}"`;
      })
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
