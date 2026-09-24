/**
 * Strict readers for private replies (Health, Knowledge): a value is exactly
 * the shape a contract names or the whole reply is refused. Each contract
 * passes its own failure, so a refusal never carries the reply's text.
 */

/** An ISO 8601 instant with its offset: "2026-09-22T19:00:00Z". */
export const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function strictReaders(fail: () => never) {
  /** A plain object, never an array, null or a class instance. */
  function plain(value: unknown): Record<string, unknown> {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype
    )
      return fail();
    return value as Record<string, unknown>;
  }

  /** Every required key present and nothing but required and optional. */
  function exactKeys(
    item: Record<string, unknown>,
    required: readonly string[],
    optional: readonly string[] = [],
  ): void {
    if (
      required.some((key) => !Object.hasOwn(item, key)) ||
      Object.keys(item).some(
        (key) => !required.includes(key) && !optional.includes(key),
      )
    )
      fail();
  }

  /** A string the pattern matches whole. */
  function matching(value: unknown, test: RegExp): string {
    return typeof value === "string" && test.test(value) ? value : fail();
  }

  /** A time the pattern allows and Date can read. */
  function time(value: unknown, test: RegExp = ISO_INSTANT): string {
    const at = matching(value, test);
    return Number.isFinite(Date.parse(at)) ? at : fail();
  }

  return { plain, exactKeys, matching, time };
}
