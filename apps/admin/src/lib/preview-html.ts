import {
  materializePreviewAssets,
  type PreviewAssetReader,
} from "./preview-public-assets";
import { publicSiteUrl } from "./editorial-content";
import { siteConfig } from "@anipotts/content/public/site";
import { previewMediaUrl, previewMediaSrcset } from "./preview-media";
import { referencedMediaIds } from "./editorial-media";
import {
  prepareOwnedPreviewMedia,
  type OwnedPreviewMediaReader,
} from "./preview-owned-media";
import { previewFailure } from "./preview-status";

export type PreviewOwnedMediaContext = {
  source: string;
  readMedia: OwnedPreviewMediaReader;
  signal?: AbortSignal;
};

/** Rendering and response materialization must both report failure to the
 * parent. An ordinary framework error page has no preview handshake. */
export async function renderPreviewResponse(
  render: () => Promise<Response>,
  requestUrl: URL,
  assets?: PreviewAssetReader,
  ownedContext?: () => PreviewOwnedMediaContext | undefined,
): Promise<Response> {
  try {
    const response = await render();
    return await previewResponse(
      response.status >= 500
        ? previewFailure(requestUrl, "unavailable", 503)
        : response,
      requestUrl,
      assets,
      ownedContext?.(),
    );
  } catch {
    return previewResponse(
      previewFailure(requestUrl, "unavailable", 503),
      requestUrl,
    );
  }
}

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
 * public CSS/fonts and snapshot-owned media travel inside the response; links
 * and published related media use www. Drafts acquire no public URLs, and the
 * frame can neither submit, connect nor escape.
 */
export async function previewResponse(
  response: Response,
  requestUrl: URL,
  assets?: PreviewAssetReader,
  owned?: PreviewOwnedMediaContext,
): Promise<Response> {
  if (response.headers.get("Content-Type")?.includes("text/html")) {
    const media = {
      requestUrl,
      publicSiteUrl: assets ? siteConfig.url : publicSiteUrl,
      // Opaque frames cannot fetch retained images from Astro's DEV origin.
      // The contained path uses the same public image origin as production;
      // exact snapshot-owned images below remain embedded, never public.
      localAssets: import.meta.env.DEV && !assets,
      ownedMediaIds: owned
        ? new Set(referencedMediaIds(owned.source))
        : undefined,
    };
    const attribute = (value: string) =>
      value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
    const original = await response.text();
    const prepared =
      assets && response.status === 200 && owned
        ? await materializePreviewAssets(
            original,
            requestUrl,
            assets,
            import.meta.env.DEV,
          )
        : original;
    let html = prepared
      // A self-sizing frame must follow content height, not its own viewport.
      // Otherwise loading large images can permanently inflate the preview.
      .replace("</head>", "<style>body{min-height:0}</style></head>")
      .replace(
        /(src|poster)="([^"<>]*)"/gu,
        (_match, name, source) =>
          `${name}="${attribute(previewMediaUrl(source, media))}"`,
      )
      .replace(
        /srcset="([^"<>]*)"/gu,
        (_match, sources) =>
          `srcset="${attribute(previewMediaSrcset(sources, media))}"`,
      )
      .replace(
        /<a(\s[^>]*?)href="(\/(?!\/)[^"<>]*)"/gu,
        (_match, attributes, path) => {
          const resolved = previewMediaUrl(path, media);
          return `<a${attributes}href="${attribute(resolved !== path ? resolved : new URL(path.replaceAll("&amp;", "&"), publicSiteUrl).href)}"`;
        },
      );
    if (assets && response.status === 200) {
      if (!owned) throw new Error("Missing owner preview snapshot");
      const ids = new Set<string>();
      const candidate = (value: string) => {
        let url: URL;
        try {
          url = new URL(value.replaceAll("&amp;", "&"), requestUrl);
        } catch {
          return null;
        }
        if (
          url.origin !== requestUrl.origin ||
          url.pathname !== "/api/editorial/media"
        )
          return null;
        const id = url.searchParams.get("id") ?? "";
        ids.add(id);
        return id;
      };
      html = html
        .replace(/\b(src|poster|href)="([^"<>]*)"/g, (tag, attr, value) => {
          const id = candidate(value);
          if (!id) return tag;
          return `${attr}="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-preview-owned-${attr}="${id}"`;
        })
        .replace(/\bsrcset="([^"<>]*)"/g, (tag, value: string) => {
          let changed = false;
          const marked = value
            .split(/\s*,\s*/)
            .map((part) => {
              const match = /^(.*?)(\s+\d+(?:\.\d+)?[wx])?$/.exec(part.trim());
              if (!match) throw new Error("Invalid preview image variant");
              const id = candidate(match[1]);
              if (!id) return part;
              changed = true;
              return `preview-owned:${id}${match[2] ?? ""}`;
            })
            .join(", ");
          return changed ? `data-preview-owned-srcset="${marked}"` : tag;
        });
      const controller = new AbortController();
      const signal = owned.signal
        ? AbortSignal.any([owned.signal, controller.signal])
        : controller.signal;
      const preparedMedia = await prepareOwnedPreviewMedia({
        source: owned.source,
        renderedIds: [...ids],
        readMedia: owned.readMedia,
        signal,
      });
      if (!preparedMedia.ok) throw new Error("Preview media unavailable");
      const offset = html.indexOf(
        '<script type="module" data-preview-public-client>',
      );
      if (offset < 0) throw new Error("Preview bootstrap missing");
      const payloads = preparedMedia.payloads;
      const prefix = html.slice(0, offset);
      const suffix = html.slice(offset);
      const encoder = new TextEncoder();
      const failure = `</script><script>parent.postMessage(${JSON.stringify({ type: "editorial-preview-status", request: requestUrl.searchParams.get("previewRequest") ?? "", status: "unavailable" }).replaceAll("<", "\\u003c")},"*")</script></body></html>`;
      async function* output() {
        yield encoder.encode(prefix);
        try {
          yield* payloads;
          if (!signal.aborted) yield encoder.encode(suffix);
        } catch {
          if (!signal.aborted) yield encoder.encode(failure);
        }
      }
      const iterator = output();
      const headers = new Headers(response.headers);
      headers.delete("Content-Length");
      headers.delete("Content-Encoding");
      headers.set("Content-Security-Policy", PREVIEW_POLICY);
      return new Response(
        new ReadableStream<Uint8Array>({
          async pull(stream) {
            try {
              const value = await iterator.next();
              if (value.done) stream.close();
              else stream.enqueue(value.value);
            } catch (error) {
              stream.error(error);
            }
          },
          async cancel() {
            controller.abort();
            await iterator.return(undefined);
          },
        }),
        { status: response.status, headers },
      );
    }
    response.headers.delete("Content-Length");
    response.headers.delete("Content-Encoding");
    response = new Response(html, {
      status: response.status,
      headers: response.headers,
    });
  }
  response.headers.set("Content-Security-Policy", PREVIEW_POLICY);
  return response;
}
