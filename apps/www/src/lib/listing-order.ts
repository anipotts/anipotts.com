/** Deterministic listing comparators shared by every public list.
 *
 * Git entries and CMS publications both pass through these, so writing,
 * work, home, feed, sitemap and search index order stays identical across
 * the legacy and published paths. Routes are unique (content.ts rejects
 * collisions), so the slug tie-break makes each order total. Slugs compare
 * by code point, not locale, so Node and workerd agree.
 */

export function compareSlug(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Newest first; undated last; equal dates by slug ascending. */
export function byNewestThenSlug<T>(
  time: (entry: T) => number | undefined,
  slug: (entry: T) => string,
) {
  return (a: T, b: T): number =>
    (time(b) ?? 0) - (time(a) ?? 0) || compareSlug(slug(a), slug(b));
}

/** Highest rank first; equal ranks by slug ascending. */
export function byRankThenSlug<T>(
  rank: (entry: T) => number,
  slug: (entry: T) => string,
) {
  return (a: T, b: T): number =>
    rank(b) - rank(a) || compareSlug(slug(a), slug(b));
}
