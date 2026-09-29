import {
  isApprovedDevPreviewOrigin,
  isLocalOwnerRequest,
} from "./admin-access-policy";

// Also imported by the standalone editorial typecheck, which excludes env.d.ts.
// Vite replaces this symbol with the build literal; this declaration emits nothing.
declare const __LOCAL_OWNER_BUILD__: boolean;

export const ADMIN_PRODUCTION_ORIGIN = "https://admin.anipotts.com";

/** Build-controlled admission, before assets or authenticated routing. Headers
 * can veto a direct local request, but never turn a remote origin into one. */
export function isAdminRequestOriginAllowed(
  request: Request,
  isDev: boolean,
  localOwnerBuild: boolean,
): boolean {
  const url = new URL(request.url);
  if (url.origin === ADMIN_PRODUCTION_ORIGIN) return true;
  return (
    ((isDev && isApprovedDevPreviewOrigin(url)) || localOwnerBuild) &&
    isLocalOwnerRequest({
      enabled: true,
      method: request.method,
      url,
      headers: request.headers,
    })
  );
}

/** Production writes use a fixed origin, never a reflected request authority.
 * Only existing development/local-owner builds can use direct loopback. */
export function adminMutationOrigin(request: Request): string {
  const url = new URL(request.url);
  if (
    url.origin !== ADMIN_PRODUCTION_ORIGIN &&
    isAdminRequestOriginAllowed(
      request,
      import.meta.env.DEV,
      __LOCAL_OWNER_BUILD__,
    )
  )
    return url.origin;
  return ADMIN_PRODUCTION_ORIGIN;
}

export function deniedAdminOrigin(): Response {
  return new Response(null, {
    status: 403,
    headers: {
      "Cache-Control": "private, no-store",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
