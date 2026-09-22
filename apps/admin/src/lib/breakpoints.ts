/**
 * The admin's four layout ranges. Stylesheets write these media queries
 * literally (custom properties cannot stand in a media condition), and the
 * table kit's `hideBelow` names them, so both read from one documented set.
 * `breakpoints.test.ts` keeps the kit's stylesheet to exactly these edges.
 *
 * | range   | width        | layout                                         |
 * |---------|--------------|------------------------------------------------|
 * | compact | <= 640       | phones: one column, two-line rows, full bleed  |
 * | medium  | 641 to 1023  | tablets: the rail, a row's State and time      |
 * | large   | 1024 to 1439 | laptops: most columns                          |
 * | wide    | >= 1440      | every column                                   |
 */
export const BREAKPOINTS = ["compact", "medium", "large", "wide"] as const;
export type Breakpoint = (typeof BREAKPOINTS)[number];

/** Each range's first CSS pixel. */
export const BREAKPOINT_MIN: Record<Breakpoint, number> = {
  compact: 0,
  medium: 641,
  large: 1024,
  wide: 1440,
};

/** The media query for everything narrower than `range`. */
export function below(range: Exclude<Breakpoint, "compact">): string {
  return `(max-width: ${BREAKPOINT_MIN[range] - 1}px)`;
}

/** The media query for `range` and everything wider. */
export function atLeast(range: Exclude<Breakpoint, "compact">): string {
  return `(min-width: ${BREAKPOINT_MIN[range]}px)`;
}

/** Whether `range` is narrower than `than`. */
export function isBelow(range: Breakpoint, than: Breakpoint): boolean {
  return BREAKPOINTS.indexOf(range) < BREAKPOINTS.indexOf(than);
}
