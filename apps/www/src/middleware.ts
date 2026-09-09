import { defineMiddleware } from "astro:middleware";
import { siteConfig } from "@anipotts/content/public";

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

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com",
  ].join("; "),
};

function applyHtmlSecurityHeaders(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;
  response = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
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
  for (const [from, to] of Object.entries(RENAMES)) {
    if (pathname === from) {
      return context.redirect(`${to}${search}`, 301);
    }
    if (pathname.startsWith(`${from}/`)) {
      return context.redirect(
        `${to}${pathname.slice(from.length)}${search}`,
        301,
      );
    }
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

  // Worker-first routing handles aliases and the newsletter host before assets.
  // Known prebuilt pages bypass Astro's on-demand catch-all entirely.
  if (
    !import.meta.env.DEV &&
    !context.isPrerendered &&
    ["GET", "HEAD"].includes(context.request.method) &&
    !pathname.startsWith("/api/") &&
    !pathname.startsWith("/ingest/")
  ) {
    const asset = await context.locals.runtime.env.ASSETS.fetch(
      context.request,
    );
    if (asset.status !== 404) return applyHtmlSecurityHeaders(asset);
  }
  const response = await next();

  return applyHtmlSecurityHeaders(response);
});
