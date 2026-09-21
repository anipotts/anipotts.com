import {
  usesPublishedContent,
  canonicalContentPath,
  isRuntimeContentPath,
} from "./lib/content-runtime-mode";
import type { SSRManifest } from "astro";
import { createExports as createAstroExports } from "@astrojs/cloudflare/entrypoints/server.js";
import { withSecurityHeaders } from "./lib/security-headers";
import {
  isStaticAssetPath,
  withConditionalStatus,
  withRenderedValidator,
  withStaticCacheControl,
} from "./lib/static-assets";
import { hiddenWritingCard, writingCardSlug } from "./lib/social-card/gate";
import { contentUnavailable } from "./lib/published-runtime";

/** Under the content store a per-article card follows its article: it
 * revalidates on every use, so an unpublished article stops sharing it. */
const GATED_CARD_CACHE = "public, max-age=0, must-revalidate";

/** Cloudflare Worker entry, named by astro.config.mjs. The adapter answers
 * prerendered pages and manifest assets from env.ASSETS before middleware
 * runs, so the security headers are applied here to every response it returns.
 * Routing and redirects stay exactly as the adapter produces them.
 *
 * That early ASSETS fetch runs outside Astro's error handling. If it throws,
 * the platform error page would carry none of the headers, so a plain 500
 * that does is returned instead. Only the error message is logged, and the
 * response body never includes it.
 *
 * GET and HEAD for static files skip the adapter and pass the original
 * request to env.ASSETS, so If-None-Match reaches the assets service and a
 * matching validator gets a 304. The assets service only matches one exact
 * tag, so a 200 left over for a list or `*` goes through the same check as
 * pages below. Their Cache-Control follows the class policy
 * in lib/static-assets. A 404 falls through to the adapter, which keeps the
 * site 404 page for missing files.
 *
 * Everything else still goes through the adapter, and a 200 whose ETag
 * matches If-None-Match is answered with a 304 here, so prerendered pages
 * revalidate too. Routing, status and body are otherwise unchanged.
 */
export function createExports(manifest: SSRManifest) {
  // The adapter checks manifest assets before middleware. Keep CMS-controlled
  // paths in the route dispatcher even if an old bundled image has this name.
  // Legacy mode still serves assets through the existing Worker/middleware path.
  const astro = createAstroExports({
    ...manifest,
    assets: new Set(
      [...manifest.assets].filter((path) => !isRuntimeContentPath(path)),
    ),
  });
  const fetch: typeof astro.default.fetch = async (request, env, context) => {
    try {
      const url = new URL(request.url);
      const { pathname } = url;
      if (usesPublishedContent(env)) {
        const canonical = canonicalContentPath(pathname);
        if (canonical === null)
          return withSecurityHeaders(
            new Response("Invalid path", {
              status: 400,
              headers: { "Cache-Control": "no-store" },
            }),
          );
        if (canonical !== pathname) {
          url.pathname = canonical;
          return withSecurityHeaders(Response.redirect(url, 308));
        }
      }
      // Previously prerendered aliases cannot bypass an activated CMS reader.
      if (
        usesPublishedContent(env) &&
        /^(?:\/index|\/(?:work|writing|systems)(?:\/[^/]+)?)\.html$/u.test(
          pathname,
        )
      ) {
        url.pathname = pathname === "/index.html" ? "/" : pathname.slice(0, -5);
        return withSecurityHeaders(Response.redirect(url, 308));
      }
      const card =
        usesPublishedContent(env) &&
        (request.method === "GET" || request.method === "HEAD")
          ? writingCardSlug(pathname)
          : null;
      if (card !== null) {
        const database = (env as { CONTENT_DB?: D1Database }).CONTENT_DB;
        if (!database) return withSecurityHeaders(contentUnavailable());
        let hidden: Response | null;
        try {
          hidden = await hiddenWritingCard(database, card);
        } catch {
          return withSecurityHeaders(contentUnavailable());
        }
        if (hidden) return withSecurityHeaders(hidden);
      }
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        !(usesPublishedContent(env) && isRuntimeContentPath(pathname)) &&
        isStaticAssetPath(pathname)
      ) {
        // The same request object. The adapter's handler type and the ASSETS
        // Fetcher type come from different workers type sets.
        const asset = await env.ASSETS.fetch(
          request as unknown as Parameters<typeof env.ASSETS.fetch>[0],
        );
        if (asset.ok || asset.status === 304) {
          const served = withStaticCacheControl(
            pathname,
            withConditionalStatus(request, pathname, asset),
          );
          if (card === null) return withSecurityHeaders(served);
          const gated = new Response(
            served.status === 304 ? null : served.body,
            served,
          );
          gated.headers.set("Cache-Control", GATED_CARD_CACHE);
          return withSecurityHeaders(gated);
        }
      }
      // HEAD renders as GET and drops the body here, so a rendered validator
      // is computed over the real body and HEAD reports the ETag GET does.
      const head = request.method === "HEAD" && !pathname.startsWith("/api/");
      const rendered = head
        ? (new Request(request as unknown as Request, {
            method: "GET",
          }) as unknown as typeof request)
        : request;
      const response = await astro.default.fetch(rendered, env, context);
      if (
        response.status === 500 &&
        !pathname.startsWith("/api/") &&
        response.headers.get("cache-control") !== "no-store"
      )
        throw new Error("upstream_unavailable");
      const result = withConditionalStatus(
        request,
        pathname,
        await withRenderedValidator(rendered, pathname, response),
      );
      if (head && result.body) {
        void result.body.cancel();
        return withSecurityHeaders(
          new Response(null, {
            status: result.status,
            statusText: result.statusText,
            headers: result.headers,
          }),
        );
      }
      return withSecurityHeaders(result);
    } catch {
      console.error("www worker fetch failed");
      return withSecurityHeaders(
        new Response("internal error", {
          status: 500,
          headers: {
            "cache-control": "no-store",
            "content-type": "text/plain; charset=utf-8",
          },
        }),
      );
    }
  };
  return { ...astro, default: { ...astro.default, fetch } };
}
