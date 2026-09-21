import {
  usesPublishedContent,
  isRuntimeContentPath,
} from "./lib/content-runtime-mode";
import {
  publicContentContext,
  publicVersionHeaders,
  contentUnavailable,
} from "./lib/published-runtime";
import { defineMiddleware } from "astro:middleware";
import { siteConfig } from "@anipotts/content/public";
import { reportRuntimeContract } from "./lib/runtime-contract";
import { withSecurityHeaders } from "./lib/security-headers";

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
      context.locals.runtime?.env,
      import.meta.env.PUBLIC_RELEASE_SHA || "dev",
    );
  }
  const { pathname, search } = context.url;
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

  const cmsSurface =
    !context.isPrerendered &&
    usesPublishedContent(context.locals.runtime?.env) &&
    isRuntimeContentPath(pathname);

  // Worker-first routing handles aliases and the newsletter host before assets.
  // Known prebuilt pages bypass Astro's on-demand catch-all entirely.
  if (
    !import.meta.env.DEV &&
    !context.isPrerendered &&
    ["GET", "HEAD"].includes(context.request.method) &&
    !cmsSurface &&
    !pathname.startsWith("/api/")
  ) {
    const asset = await context.locals.runtime.env.ASSETS.fetch(
      context.request,
    );
    if (asset.status !== 404) return withSecurityHeaders(asset);
  }
  if (cmsSurface) {
    try {
      const { version } = await publicContentContext(context.locals).inventory;
      const response = await next();
      if (response.status >= 500)
        return withSecurityHeaders(contentUnavailable());
      const result = new Response(response.body, response);
      for (const [name, value] of Object.entries(publicVersionHeaders(version)))
        result.headers.set(name, value);
      return withSecurityHeaders(result);
    } catch {
      return withSecurityHeaders(contentUnavailable());
    }
  }
  return withSecurityHeaders(await next());
});
