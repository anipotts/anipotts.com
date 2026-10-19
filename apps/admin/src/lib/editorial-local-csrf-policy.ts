import { isLocalOwnerRequest } from "./admin-access-policy";

/** The existing local-owner build and direct-client guards are both required.
 * Headers may reject eligibility, but cannot enable the compile-time flag. */
export function isLocalOwnerHttpCsrfRequest(
  request: Request,
  localOwnerBuild: boolean,
): boolean {
  const url = new URL(request.url);
  return (
    url.protocol === "http:" &&
    isLocalOwnerRequest({
      enabled: localOwnerBuild,
      method: request.method,
      url,
      headers: request.headers,
    })
  );
}
