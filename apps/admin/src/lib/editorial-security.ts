import { readBoundedBytes } from "./bounded-body";
import { constantTimeEqual, randomHex } from "./crypto";
import { HEX64 } from "./patterns";
import { isLocalOwnerHttpCsrfRequest } from "./editorial-local-csrf-policy";

// Also checked by the standalone editorial typecheck, without env.d.ts.
declare const __LOCAL_OWNER_BUILD__: boolean;

const csrfCookie = "__Host-editorial-csrf";

function csrfCookiePolicy(request?: Request) {
  // Keep the local name inside the build-time branch so release bundles remove
  // it entirely. Plain HTTP WebKit refuses Secure cookies, including loopback.
  if (
    __LOCAL_OWNER_BUILD__ &&
    request &&
    isLocalOwnerHttpCsrfRequest(request, true)
  )
    return { name: "editorial-local-owner-csrf", secure: false };
  return { name: csrfCookie, secure: true };
}

/** The one private JSON response: never cached, indexed, framed or sniffed.
 * Failures carry `{ error: code }`. */
export function privateJson(
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  const response = Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "CDN-Cache-Control": "no-store",
      "Cloudflare-CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
  new Headers(headers).forEach((value, name) =>
    response.headers.set(name, value),
  );
  return response;
}

/** Call only after verifying the Access assertion. The token grants no identity. */
export function issueEditorialCsrf(request?: Request): Response {
  const policy = csrfCookiePolicy(request);
  const existing = (request?.headers.get("Cookie") ?? "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value.startsWith(`${policy.name}=`));
  const previous =
    existing.length === 1 ? existing[0]!.slice(policy.name.length + 1) : "";
  const token = HEX64.test(previous) ? previous : randomHex(32);
  const response = privateJson({ csrf: token });
  response.headers.set(
    "Set-Cookie",
    `${policy.name}=${token}; Path=/; HttpOnly;${policy.secure ? " Secure;" : ""} SameSite=Strict`,
  );
  return response;
}

/** Defense in depth after authentication, never an alternative to it. */
export function checkEditorialMutation(
  request: Request,
  configuredOrigin: string,
): "origin_required" | "csrf_required" | "json_required" | null {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (url.origin !== configuredOrigin || origin !== configuredOrigin)
    return "origin_required";
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite !== null && fetchSite !== "same-origin")
    return "origin_required";
  const policy = csrfCookiePolicy(request);
  const cookies = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter((cookie) => cookie.startsWith(`${policy.name}=`));
  // Duplicate cookies are ambiguous and rejected instead of choosing first/last.
  if (cookies.length !== 1) return "csrf_required";
  const cookie = cookies[0]!.slice(policy.name.length + 1);
  const supplied = request.headers.get("X-Editorial-CSRF");
  if (
    !HEX64.test(cookie) ||
    !supplied ||
    !HEX64.test(supplied) ||
    !constantTimeEqual(cookie, supplied)
  )
    return "csrf_required";
  if (
    request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase() !==
    "application/json"
  )
    return "json_required";
  return null;
}

/** Bound streaming input too; Content-Length is only an early rejection hint. */
export async function readEditorialJson(
  request: Request,
  limit: number,
): Promise<unknown> {
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > limit))
    throw new Error("request_too_large");
  if (!request.body) throw new Error("invalid_json");
  const bytes = await readBoundedBytes(request.body, limit);
  if (!bytes) throw new Error("request_too_large");
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    );
  } catch {
    throw new Error("invalid_json");
  }
}
