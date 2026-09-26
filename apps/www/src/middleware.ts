import {
  canonicalContentPath,
  isCacheableContentPath,
  isRuntimeContentPath,
} from "./lib/content-paths";
import {
  publicContentContext,
  publicVersionHeaders,
  publicCacheHeaders,
  publicEntityTag,
  publicEdgeCache,
  edgeCacheKey,
  edgeCacheCopy,
  fromEdgeCache,
  contentUnavailable,
} from "./lib/published-runtime";
import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { siteConfig } from "@anipotts/content/public";
import { reportRuntimeContract } from "./lib/runtime-contract";
import { withSecurityHeaders } from "./lib/security-headers";
import { ifNoneMatchMatches } from "./lib/static-assets";
import { executionContext, runtimeEnv } from "./lib/runtime-env";

/** A CMS surface. A cacheable route answers a matching validator with a 304,
 * and a stored colo copy with a 200, from the inventory counter alone, before
 * the publications are loaded or anything renders. Everything else renders
 * from one coherent inventory read and takes its validator from that read's
 * version, so a tag always names the inventory its body came from. Failures
 * leave as the no-store 503 through the caller. */
async function publishedResponse(
  context: APIContext,
  next: MiddlewareNext,
): Promise<Response> {
  const { pathname } = context.url;
  const { method } = context.request;
  const content = publicContentContext(context.locals);
  const cacheable =
    (method === "GET" || method === "HEAD") && isCacheableContentPath(pathname);
  const condition = cacheable
    ? context.request.headers.get("if-none-match")
    : null;
  // `*` matches any current representation, and only rendering can tell
  // whether this route has one. src/worker.ts answers it after rendering.
  const validator =
    condition?.trim() && condition.trim() !== "*" ? condition : null;
  const edge = cacheable ? publicEdgeCache() : null;
  const ctx = executionContext(context.locals);
  const waitUntil = ctx?.waitUntil?.bind(ctx);
  if (validator || edge) {
    // Sequential on purpose: loading the publications alongside would save a
    // miss one single-row round trip but costs every hit the full read and
    // its snapshot checks (measured locally: about 2 ms against 6 ms a hit).
    const version = await content.version;
    const etag = await publicEntityTag(version, pathname);
    if (validator && ifNoneMatchMatches(validator, etag))
      return new Response(null, {
        status: 304,
        headers: publicCacheHeaders(version, etag),
      });
    if (edge) {
      const cached = await edge
        .match(edgeCacheKey(context.url, etag))
        .catch(() => undefined);
      if (cached?.status === 200)
        return fromEdgeCache(cached, version, etag, method === "HEAD");
      void cached?.body?.cancel();
    }
  }
  const { version } = await content.inventory;
  const response = await next();
  if (response.status >= 500) {
    void response.body?.cancel();
    return contentUnavailable();
  }
  const result = new Response(response.body, response);
  if (!cacheable || response.status !== 200) {
    for (const [name, value] of Object.entries(publicVersionHeaders(version)))
      result.headers.set(name, value);
    return result;
  }
  const etag = await publicEntityTag(version, pathname);
  for (const [name, value] of Object.entries(publicCacheHeaders(version, etag)))
    result.headers.set(name, value);
  if (edge && waitUntil && method === "GET" && result.body) {
    result.headers.set("X-Content-Cache", "miss");
    const stored = edgeCacheCopy(result.clone());
    waitUntil(
      edge.put(edgeCacheKey(context.url, etag), stored).catch(() => undefined),
    );
  }
  return result;
}

/** flat redirect map: pathname (exact or prefix) -> destination. */
const REDIRECTS: Record<string, string> = {
  "/shipping": "/work",
  "/running": "/work",
  "/connect": "/systems",
  "/lab": "/systems",
  "/dev": "/systems",
  "/updates": "/systems",
  "/metrics": "/systems",
  "/status": "/systems",
  "/docs": "/",
  "/labs": "/systems",
};

const NEWS_HOST = new URL(siteConfig.newsletterUrl).hostname;

/** segment renames (noun -> verb). preserve subpaths and query. these are
 *  external link-equity redirects: every old anipotts.com/thoughts/* url
 *  ever shared keeps resolving. */
const RENAMES: Record<string, string> = {
  "/making": "/work",
  "/projects": "/work",
  "/thoughts": "/writing",
  "/claude": "/systems",
  "/orchestrating": "/systems",
};

/** renamed work pages, exact path. applied after segment renames so an old
 *  /projects/<slug> link reaches the new page in one hop. */
const WORK_SLUG_RENAMES: Record<string, string> = {
  "/work/claude-code-tips": "/work/agents",
};

export const onRequest = defineMiddleware(async (context, next) => {
  // Log the runtime configuration contract once per isolate. It never blocks.
  // Static asset paths never get here: the adapter handler that src/worker.ts
  // wraps serves them through env.ASSETS before middleware runs, so this
  // covers dynamic routes only. Prerendering and dev have no deployed env.
  if (!import.meta.env.DEV && !context.isPrerendered) {
    reportRuntimeContract(
      runtimeEnv(context.locals),
      import.meta.env.PUBLIC_RELEASE_SHA || "dev",
    );
  }
  const { pathname, search } = context.url;
  const dynamic = !context.isPrerendered;
  if (dynamic) {
    const canonical = canonicalContentPath(pathname);
    if (canonical === null)
      return withSecurityHeaders(
        new Response("Invalid path", {
          status: 400,
          headers: { "Cache-Control": "no-store" },
        }),
      );
    if (canonical !== pathname) {
      const target = new URL(context.url);
      target.pathname = canonical;
      return context.redirect(target.href, 308);
    }
  }
  const host = context.url.hostname.toLowerCase();
  // Newsletter delivery endpoints remain available; its editorial pages are unpublished.
  if (
    pathname === "/newsletter" ||
    pathname === "/newsletter/archive" ||
    (host === NEWS_HOST && ["/", "/archive"].includes(pathname))
  ) {
    return new Response("not found", {
      status: 404,
      headers: { "Content-Type": "text/plain", "X-Robots-Tag": "noindex" },
    });
  }

  // segment renames: preserve the tail. /thoughts/foo -> /writing/foo.
  let target = pathname;
  for (const [from, to] of Object.entries(RENAMES)) {
    if (pathname === from || pathname.startsWith(`${from}/`)) {
      target = `${to}${pathname.slice(from.length)}`;
      break;
    }
  }
  target = WORK_SLUG_RENAMES[target.replace(/(.)\/$/, "$1")] ?? target;
  if (target !== pathname) {
    return context.redirect(`${target}${search}`, 301);
  }

  // flat redirects: tail is discarded. "/lab" and "/lab/..." both land
  // on the destination instead of preserving stale subpaths.
  for (const [from, to] of Object.entries(REDIRECTS)) {
    if (pathname === from || pathname.startsWith(`${from}/`)) {
      return context.redirect(`${to}${search}`, 301);
    }
  }

  // /admin moved to the admin subdomain
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const adminPath = pathname.replace(/^\/admin/, "") || "/";
    const origin = import.meta.env.DEV
      ? "http://localhost:4311"
      : siteConfig.adminUrl;
    return context.redirect(`${origin}${adminPath}${search}`, 308);
  }

  const cmsSurface = dynamic && isRuntimeContentPath(pathname);

  // Worker-first routing handles aliases and the newsletter host before assets.
  // Known prebuilt pages bypass Astro's on-demand catch-all entirely.
  if (
    !import.meta.env.DEV &&
    dynamic &&
    ["GET", "HEAD"].includes(context.request.method) &&
    !cmsSurface &&
    !pathname.startsWith("/api/")
  ) {
    const asset = await runtimeEnv(context.locals).ASSETS.fetch(
      context.request,
    );
    if (asset.status !== 404) return withSecurityHeaders(asset);
  }
  if (cmsSurface) {
    try {
      return withSecurityHeaders(await publishedResponse(context, next));
    } catch {
      return withSecurityHeaders(contentUnavailable());
    }
  }
  return withSecurityHeaders(await next());
});
