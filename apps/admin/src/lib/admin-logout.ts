import {
  adminJson,
  assertExactOrigin,
  expiredAdminSessionCookies,
  type AdminAuthContext,
} from "./admin-auth";
import { verifyEditorialOwner } from "./access-identity";
import { constantTimeEqual, sha256Hex } from "./crypto";
import { runtimeEnv } from "./runtime-env";

type Dependencies = { verifyOwner?: typeof verifyEditorialOwner };

const ACCESS_LOGOUT = "/cdn-cgi/access/logout";

/** Sign out ends the Access session. The token is bound to the verified
 * assertion, and the response expires the retired native cookies. */
export async function adminLogout(
  context: AdminAuthContext,
  dependencies: Dependencies = {},
): Promise<Response> {
  const method = context.request.method;
  if (method !== "GET" && method !== "POST")
    return adminJson(
      { error: "method_not_allowed" },
      { status: 405, headers: { Allow: "GET, POST" } },
    );
  try {
    if (method === "POST") assertExactOrigin(context.request, context.url);
    // The client uses fetch. Cross-site navigation must not expose a logout capability.
    if (context.request.headers.get("sec-fetch-site") === "cross-site")
      return adminJson({ error: "invalid_origin" }, { status: 403 });
    const assertion = context.request.headers.get("cf-access-jwt-assertion");
    const owner = await (dependencies.verifyOwner ?? verifyEditorialOwner)(
      context.request,
      runtimeEnv(),
    );
    if (!owner)
      return assertion
        ? adminJson({ error: "logout_unavailable" }, { status: 503 })
        : adminJson({ error: "admin_session_required" }, { status: 401 });
    const csrf = await sha256Hex(`admin-logout-v2:${assertion}`);
    if (method === "GET")
      return adminJson({ csrf, destination: ACCESS_LOGOUT });
    const supplied = context.request.headers.get("x-admin-csrf") ?? "";
    if (!supplied || !constantTimeEqual(supplied, csrf))
      return adminJson({ error: "csrf_invalid" }, { status: 403 });
    const response = adminJson({ ok: true, destination: ACCESS_LOGOUT });
    for (const cookie of expiredAdminSessionCookies())
      response.headers.append("set-cookie", cookie);
    return response;
  } catch (error) {
    if (error instanceof Response) return error;
    return adminJson({ error: "logout_unavailable" }, { status: 503 });
  }
}
