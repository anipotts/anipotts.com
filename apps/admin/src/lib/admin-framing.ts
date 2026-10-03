const CSP = "Content-Security-Policy";
const DENY_FRAMING = "frame-ancestors 'none'";
const FRAME_ANCESTORS_DIRECTIVE = /(?:^|[;,])\s*frame-ancestors(?:[\s;,]|$)/i;

/**
 * Admin pages must never render inside another site's frame, where a click
 * could drive owner actions. This merges into a route's own policy and keeps
 * a frame-ancestors the route already chose, such as the same-origin draft
 * preview the editor embeds.
 */
export function denyAdminFraming(headers: Headers): void {
  const policy = headers.get(CSP)?.trim() ?? "";
  if (policy === "") {
    headers.set(CSP, DENY_FRAMING);
    return;
  }
  if (FRAME_ANCESTORS_DIRECTIVE.test(policy)) return;
  headers.set(CSP, `${policy.replace(/;\s*$/, "")}; ${DENY_FRAMING}`);
}
