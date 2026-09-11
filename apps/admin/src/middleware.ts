import { defineMiddleware } from "astro:middleware";
import {
  retainedAccessPrincipal,
  verifyEditorialOwner,
} from "./lib/access-identity";
import { privateEditorialResponse } from "./lib/editorial-security";
import { publicSiteUrl } from "./lib/editorial-content";
import { editorialImagePreview } from "./lib/editorial-media";
import {
  isApprovedDevPreviewOrigin,
  isDevLoopbackPreviewRequest,
  isPublicAdminPath,
} from "./lib/admin-access-policy";
import {
  adminJson,
  applyAdminSetCookies,
  resolveAdminSession,
  sanitizeAdminReturnPath,
} from "./lib/admin-auth";

export const onRequest = defineMiddleware(async (context, next) => {
  if (
    context.url.pathname === "/" ||
    context.url.pathname === "/content" ||
    context.url.pathname.startsWith("/content/") ||
    context.url.pathname === "/newsletter" ||
    context.url.pathname.startsWith("/newsletter/") ||
    context.url.pathname.startsWith("/api/editorial/") ||
    ["/preview/home", "/preview/record"].includes(context.url.pathname)
  ) {
    const local =
      import.meta.env.DEV &&
      import.meta.env.EDITORIAL_LOCAL_PREVIEW === true &&
      isApprovedDevPreviewOrigin(context.url);
    // This namespace never accepts legacy passwords, sessions, or identity headers.
    if (
      !local &&
      !(await verifyEditorialOwner(
        context.request,
        context.locals.runtime?.env ?? {},
      ))
    ) {
      return privateEditorialResponse({ error: "owner_required" }, 401);
    }
    let response = await next();
    if (
      ["/preview/home", "/preview/record"].includes(context.url.pathname) &&
      response.headers.get("Content-Type")?.includes("text/html")
    ) {
      // Existing public assets are served by www; drafts never acquire public URLs.
      const html = (await response.text())
        .replace(
          /(src|poster)="(\/(?:images|media|fonts)\/[^"<>]*)"/g,
          (_match, attribute, path) => {
            const preview = editorialImagePreview(path);
            return `${attribute}="${new URL(preview, preview !== path || import.meta.env.DEV ? context.url : publicSiteUrl).href}"`;
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
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    if (["/preview/home", "/preview/record"].includes(context.url.pathname))
      response.headers.set(
        "Content-Security-Policy",
        "sandbox allow-scripts; form-action 'none'; frame-ancestors 'self'; connect-src 'none'",
      );
    return response;
  }
  if (
    isDevLoopbackPreviewRequest({
      isDev: import.meta.env.DEV,
      method: context.request.method,
      url: context.url,
    })
  ) {
    return next();
  }

  if (!isPublicAdminPath(context.url.pathname)) {
    const principal = await retainedAccessPrincipal(
      context.request,
      context.locals.runtime?.env ?? {},
    );
    if (principal) {
      context.locals.adminPrincipal = principal;
      const response = await next();
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
      return response;
    }
  }

  const resolved = await resolveAdminSession(context);
  context.locals.adminPrincipal = resolved.principal ?? undefined;
  context.locals.adminSetCookies = resolved.setCookies;

  if (isPublicAdminPath(context.url.pathname)) {
    if (
      context.url.pathname === "/auth" &&
      resolved.principal &&
      !resolved.principal.restriction &&
      context.url.searchParams.get("stepup") !== "1"
    ) {
      const destination = sanitizeAdminReturnPath(
        context.url.searchParams.get("next"),
      );
      return applyAdminSetCookies(
        context.redirect(destination, 302),
        resolved.setCookies,
      );
    }
    return applyAdminSetCookies(await next(), resolved.setCookies);
  }

  const isRecoveryRoute =
    context.url.pathname === "/auth/recover/passkey" ||
    context.url.pathname.startsWith("/api/admin/recovery/passkey/");
  if (
    resolved.principal &&
    (resolved.principal.restriction === null ||
      (isRecoveryRoute && resolved.principal.restriction === "recovery"))
  ) {
    return applyAdminSetCookies(await next(), resolved.setCookies);
  }

  if (context.url.pathname.startsWith("/api/")) {
    return applyAdminSetCookies(
      adminJson({ error: "admin_session_required" }, { status: 401 }),
      resolved.setCookies,
    );
  }

  const nextPath = encodeURIComponent(
    `${context.url.pathname}${context.url.search}`,
  );
  return applyAdminSetCookies(
    context.redirect(`/auth?next=${nextPath}`, 302),
    resolved.setCookies,
  );
});
