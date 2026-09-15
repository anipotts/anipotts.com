import { readEditorialJson } from "./editorial-security";

/**
 * Per-route byte ceilings for the retained compatibility POST routes. Each one
 * covers the largest input the route's validator accepts with worst-case JSON
 * escaping, so a valid request is never rejected by size alone.
 */
export const COMPATIBILITY_JSON_LIMITS = {
  // Existing ceiling: a 500 character reason plus an idempotency key.
  controlCommand: 2_048,
  // Draft body 50,000 characters plus title, summary and tags.
  contentEditor: 524_288,
  // Proposed value 20,000 characters plus page key, field path and source.
  draftOperation: 131_072,
} as const;

export class CompatibilityJsonError extends Error {
  constructor(
    readonly status: 400 | 413,
    readonly code: "invalid_json" | "request_too_large",
  ) {
    super(code);
  }
}

/** Counts actual bytes before parsing; Content-Length is only an early hint. */
export async function readCompatibilityJson(
  request: Request,
  limit: number,
): Promise<unknown> {
  try {
    return await readEditorialJson(request, limit);
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large") {
      throw new CompatibilityJsonError(413, "request_too_large");
    }
    throw new CompatibilityJsonError(400, "invalid_json");
  }
}

const ERROR_CODE = /^[a-z][a-z0-9_]{0,63}$/u;

/**
 * Returns a code-owned error code, never exception or provider text. A code
 * qualified with caller input (`unknown_field:<key>`) keeps only its prefix.
 */
export function boundedErrorCode(
  message: string,
  fallback: string,
  allowed?: ReadonlySet<string>,
): string {
  const code = message.split(":", 1)[0] ?? "";
  if (!ERROR_CODE.test(code)) return fallback;
  if (allowed && !allowed.has(code)) return fallback;
  return code;
}
