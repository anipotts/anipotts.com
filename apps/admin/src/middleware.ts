import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import {
  retainedAccessPrincipal,
  verifyEditorialOwner,
} from "./lib/access-identity";
import { privateJson } from "./lib/editorial-security";
import { PREVIEW_PATHS, previewResponse } from "./lib/preview-html";
import {
  isApprovedDevPreviewOrigin,
  isDevLoopbackPreviewRequest,
  isLocalOwnerRequest,
  isPublicAdminPath,
} from "./lib/admin-access-policy";
import {
  denyLocalOwnerFraming,
  localOwnerPrincipal,
} from "./lib/admin-local-owner";
import { adminJson } from "./lib/admin-auth";
import { PRIVATE_READER_CANARY_PATH } from "./lib/private-reader-canary";
import { applyServerTiming, createServerTiming } from "./lib/server-timing";
import { runtimeEnv } from "./lib/runtime-env";

/** Content, the overview, the editorial APIs, the private reader and the
 * draft previews accept only the signed owner. */
function isEditorialPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/content" ||
    pathname.startsWith("/content/") ||
    pathname === "/newsletter" ||
    pathname.startsWith("/newsletter/") ||
    pathname.startsWith("/api/editorial/") ||
    pathname.startsWith("/api/private-reader/") ||
    PREVIEW_PATHS.has(pathname)
  );
}

/** Owner responses are never cached or indexed, and a local owner is never framed. */
function withPrivateHeaders(response: Response, localOwner: boolean) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (localOwner) denyLocalOwnerFraming(response.headers);
  return response;
}

async function handleRequest(
  context: APIContext,
  next: MiddlewareNext,
): Promise<Response> {
  const { pathname } = context.url;
  // Sign out verifies the Access assertion itself.
  if (pathname === "/api/admin/logout" || pathname === "/auth/logout")
    return next();
  // The reader canary admits exactly one Access service token, which its
  // route verifies against its own Access application. No owner is involved.
  if (pathname === PRIVATE_READER_CANARY_PATH)
    return withPrivateHeaders(await next(), false);
  const env = runtimeEnv();
  // A build-time constant, never a runtime value. Deployable builds compile
  // it to false, which removes this whole path from the bundle.
  const localOwner =
    __LOCAL_OWNER_BUILD__ &&
    !isPublicAdminPath(pathname) &&
    isLocalOwnerRequest({
      enabled: true,
      method: context.request.method,
      url: context.url,
      headers: context.request.headers,
    });
  if (localOwner) context.locals.adminPrincipal = localOwnerPrincipal();
  if (isEditorialPath(pathname)) {
    const local =
      localOwner ||
      (import.meta.env.DEV &&
        import.meta.env.EDITORIAL_LOCAL_PREVIEW === true &&
        isApprovedDevPreviewOrigin(context.url));
    // This namespace never accepts legacy passwords, sessions, or identity
    // headers. Routes read the verified owner from locals, never again.
    if (!local) {
      const owner = await verifyEditorialOwner(context.request, env);
      if (!owner) return privateJson({ error: "owner_required" }, 401);
      context.locals.accessOwner = owner;
    }
    const response = await next();
    return withPrivateHeaders(
      PREVIEW_PATHS.has(pathname)
        ? await previewResponse(response, context.url)
        : response,
      localOwner,
    );
  }
  if (localOwner) return withPrivateHeaders(await next(), true);
  if (
    isDevLoopbackPreviewRequest({
      isDev: import.meta.env.DEV,
      method: context.request.method,
      url: context.url,
    })
  ) {
    return next();
  }

  if (isPublicAdminPath(pathname)) return next();

  // Cloudflare Access is the only sign-in. The verified owner reads these
  // pages; writes live in the editorial namespace above.
  const principal = await retainedAccessPrincipal(context.request, env);
  if (principal) {
    context.locals.adminPrincipal = principal;
    return withPrivateHeaders(await next(), false);
  }

  if (pathname.startsWith("/api/"))
    return adminJson({ error: "admin_session_required" }, { status: 401 });

  const nextPath = encodeURIComponent(`${pathname}${context.url.search}`);
  return context.redirect(`/auth?next=${nextPath}`, 302);
}

// Loaders record durations and counts on the request. The header is written
// when the response object exists, before the body streams, so it covers work
// done in page frontmatter and in head-propagating layouts.
export const onRequest = defineMiddleware(async (context, next) => {
  const started = performance.now();
  const timing = createServerTiming();
  context.locals.serverTiming = timing;
  const response = await handleRequest(context, next);
  return applyServerTiming(response, timing, performance.now() - started);
});
