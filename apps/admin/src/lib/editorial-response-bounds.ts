import { MAX_SOURCE_BYTES } from "@anipotts/content/editorial/record";

/** DraftStore budgets encoded revision snapshots before the history wrapper. */
export const MAX_HISTORY_PAGE_BYTES = 4 * 1024 * 1024;
// Envelope fields, at most 100 separators, record identity and publication status.
const RESPONSE_METADATA_BYTES = 64 * 1024;
// JSON can encode each raw ASCII control byte as a six-byte Unicode escape.
export const MAX_EDITORIAL_SOURCE_RESPONSE_BYTES =
  MAX_SOURCE_BYTES * 6 + RESPONSE_METADATA_BYTES;
export const MAX_EDITORIAL_HISTORY_RESPONSE_BYTES =
  MAX_HISTORY_PAGE_BYTES + RESPONSE_METADATA_BYTES;
export const MAX_EDITORIAL_RECORD_RESPONSE_BYTES =
  MAX_HISTORY_PAGE_BYTES + MAX_SOURCE_BYTES * 12 + RESPONSE_METADATA_BYTES;

/** Only these editorial endpoints return source; every other JSON call retains
 * the protected transport's ordinary limit. Query values never raise a bound. */
export function editorialResponseLimit(input: string): number | undefined {
  const path = input.split("?")[0];
  if (path === "/api/editorial/record" || path === "/api/editorial/home")
    return MAX_EDITORIAL_RECORD_RESPONSE_BYTES;
  if (path === "/api/editorial/history")
    return MAX_EDITORIAL_HISTORY_RESPONSE_BYTES;
  if (
    /^\/api\/editorial\/(?:baseline|draft|save|rebase|create|restore|discard)$/.test(
      path ?? "",
    )
  )
    return MAX_EDITORIAL_SOURCE_RESPONSE_BYTES;
  return undefined;
}
