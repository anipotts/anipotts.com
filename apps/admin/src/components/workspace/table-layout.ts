import type { CSSProperties } from "react";
import { BREAKPOINTS, isBelow, type Breakpoint } from "../../lib/breakpoints";
import type { Column } from "./Workspace";

const FLEX_MIN_WIDTH = 80;

/** The columns a range shows. */
const shownIn = <T>(columns: readonly Column<T>[], range: Breakpoint) =>
  columns.filter(
    (column) =>
      column.hideBelow === undefined || !isBelow(range, column.hideBelow),
  );

/** The table's minimum width in each range, from its visible columns only. */
export function tableMinWidths<T>(
  columns: readonly Column<T>[],
): Record<Breakpoint, number> {
  const at = (range: Breakpoint) =>
    range === "compact"
      ? 0
      : shownIn(columns, range).reduce(
          (sum, column) => sum + (column.width ?? column.min ?? FLEX_MIN_WIDTH),
          0,
        );
  return Object.fromEntries(
    BREAKPOINTS.map((range) => [range, at(range)]),
  ) as Record<Breakpoint, number>;
}

/** A shared column's width. The frame is a size container, so 100cqw is the
 * width the table has: a length, which a fixed layout honours. Header cells
 * carry max-width 0 (for their ellipsis), so the width is the minimum too. */
export function shareWidth(
  share: number,
  reserve = 0,
  min = FLEX_MIN_WIDTH,
  want?: number,
): CSSProperties {
  const room = "(100cqw - var(--workspace-table-fixed, 0px))";
  const even = `${room} * ${share}`;
  const part = want ? `max(${even}, ${want}px)` : even;
  const kept = reserve ? `min(${part}, ${room} - ${reserve}px)` : part;
  const width = `max(${min}px, ${kept})`;
  return { width, minWidth: width };
}

/**
 * A shared column's width in pixels for a table `frame` wide whose shown
 * fixed columns take `fixed`: the arithmetic shareWidth writes in CSS, for
 * tests that pin a layout at a given width.
 */
export function shareWidthAt(
  column: Pick<Column<unknown>, "share" | "reserve" | "min" | "want">,
  frame: number,
  fixed: number,
): number {
  const room = frame - fixed;
  const even = room * (column.share ?? 1);
  const part = column.want ? Math.max(even, column.want) : even;
  const kept = column.reserve ? Math.min(part, room - column.reserve) : part;
  return Math.max(column.min ?? FLEX_MIN_WIDTH, kept);
}

/** How many `spread` columns each range shows, for their even part. */
function tableSpreadCounts<T>(
  columns: readonly Column<T>[],
): Record<Breakpoint, number> {
  return Object.fromEntries(
    BREAKPOINTS.map((range) => [
      range,
      shownIn(columns, range).filter((column) => column.spread).length,
    ]),
  ) as Record<Breakpoint, number>;
}

/** A spread column's width: its own, and an even part of what the lead
 * leaves past `leadMax` in the range (the frame is a size container, and
 * the range's fixed columns, spread ones included, are
 * --workspace-table-fixed). */
export function spreadWidth(width: number, leadMax: number): CSSProperties {
  const extra = `max(0px, 100cqw - var(--workspace-table-fixed, 0px) - ${leadMax}px)`;
  // Header cells carry max-width 0, so the width is the minimum too.
  const spread = `calc(${width}px + ${extra} / var(--workspace-table-spread, 1))`;
  return { width: spread, minWidth: spread };
}

/** What each range's fixed columns take, for a flexible column's `share`. */
export function tableFixedWidths<T>(
  columns: readonly Column<T>[],
): Record<Breakpoint, number> {
  return Object.fromEntries(
    BREAKPOINTS.map((range) => [
      range,
      shownIn(columns, range).reduce(
        (sum, column) => sum + (column.width ?? 0),
        0,
      ),
    ]),
  ) as Record<Breakpoint, number>;
}

/** The media query for each range above compact, as the kit's stylesheet
 * writes it. */
const RANGE_MEDIA: Record<Exclude<Breakpoint, "compact">, string> = {
  medium: "(min-width: 641px) and (max-width: 1023px)",
  large: "(min-width: 1024px) and (max-width: 1439px)",
  wide: "(min-width: 1440px)",
};

/**
 * Where each `yieldOrder` column gives way in a range: below the lead's
 * `room` plus every shown fixed column (a shared column at its least), the
 * lowest order first, and each next one below that less what the earlier
 * ones gave back. Frame widths in px; a column hides where the table frame
 * is narrower than its `below`.
 */
export function yieldThresholds<T>(
  columns: readonly Column<T>[],
  range: Exclude<Breakpoint, "compact">,
): Array<{ key: string; below: number }> {
  const room = columns[0]?.room;
  if (!room) return [];
  const shown = shownIn(columns, range).slice(1);
  let need =
    room +
    shown.reduce(
      (sum, column) =>
        sum +
        (column.width ??
          (column.share !== undefined ? (column.min ?? FLEX_MIN_WIDTH) : 0)),
      0,
    );
  const out: Array<{ key: string; below: number }> = [];
  for (const column of shown
    .filter((item) => item.yieldOrder !== undefined)
    .sort((a, b) => a.yieldOrder! - b.yieldOrder!)) {
    out.push({ key: column.key, below: need });
    need -= column.width ?? 0;
  }
  return out;
}

/** The columns a table `frame` px wide shows in a range once its
 * `yieldOrder` columns have given way: what the CSS below draws. */
export function columnsAt<T>(
  columns: readonly Column<T>[],
  range: Exclude<Breakpoint, "compact">,
  frame: number,
): Column<T>[] {
  const hidden = new Set(
    yieldThresholds(columns, range)
      .filter(({ below }) => frame < below)
      .map(({ key }) => key),
  );
  return shownIn(columns, range).filter((column) => !hidden.has(column.key));
}

/**
 * The container queries that hide `yieldOrder` columns where the table is
 * too narrow for the lead's `room` beside them (yieldThresholds), one range
 * at a time. A column's YieldOnly parts show where it hides. Empty when no
 * column yields.
 */
export function tableYieldRules<T>(
  columns: readonly Column<T>[],
  scope: string,
): string {
  const at = `[data-yield-scope="${scope}"]`;
  const rules: string[] = [];
  for (const range of ["medium", "large", "wide"] as const) {
    const queries = yieldThresholds(columns, range).map(
      ({ key, below }) =>
        `@container (max-width: ${below - 0.5}px) { ${at} [data-column="${key}"] { display: none; } ${at} [data-yield-for="${key}"] { display: contents; } }`,
    );
    if (queries.length)
      rules.push(`@media ${RANGE_MEDIA[range]} { ${queries.join(" ")} }`);
  }
  return rules.join("\n");
}

/** One sizing contract for both rendering libraries. */
export function tableColumnStyle<T>(
  column: Column<T>,
  columns: readonly Column<T>[],
): CSSProperties {
  const leadMax = columns.find(
    (item) => item.width === undefined && item.max !== undefined,
  )?.max;
  const { width, share, reserve, min, want, spread } = column;
  return width !== undefined
    ? spread && leadMax !== undefined
      ? spreadWidth(width, leadMax)
      : { width, minWidth: width }
    : share !== undefined
      ? shareWidth(share, reserve, min, want)
      : { width: "auto", minWidth: min ?? FLEX_MIN_WIDTH };
}

export function tableFrameStyle<T>(
  columns: readonly Column<T>[],
  selectionWidth = 0,
): CSSProperties {
  const minimum = tableMinWidths(columns);
  const fixed = tableFixedWidths(columns);
  const spreads = tableSpreadCounts(columns);
  return Object.fromEntries(
    BREAKPOINTS.flatMap((range) => [
      [
        `--workspace-table-min-${range}`,
        `${minimum[range] + (range === "compact" ? 0 : selectionWidth)}px`,
      ],
      [
        `--workspace-table-fixed-${range}`,
        `${fixed[range] + selectionWidth}px`,
      ],
      [`--workspace-table-spread-${range}`, String(spreads[range] || 1)],
    ]),
  ) as CSSProperties;
}

/** Reflow the complete record before its title loses useful reading room. */
export function tableReflowWidth<T>(
  columns: readonly Column<T>[],
  selectionWidth = 0,
): number {
  return Math.max(
    560,
    selectionWidth +
      Math.max(240, columns[0]?.room ?? columns[0]?.reserve ?? 280) +
      columns
        .slice(1)
        .reduce((sum, column) => sum + (column.width ?? column.min ?? 80), 0),
  );
}

/** Scoped container queries provide correct geometry before hydration. */
const REFLOW_CSS = `.admin-data-table[data-narrow="true"] .openai-record-table thead {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.admin-data-table[data-narrow="true"] .openai-record-table thead button {
  visibility: hidden;
}
.admin-data-table[data-narrow="true"]
  .openai-record-table
  :is(tbody, tr, th, td) {
  display: block;
  width: auto;
  min-width: 0;
  max-width: none;
}
.admin-data-table[data-narrow="true"] .openai-record-table tr[data-record-id] {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  padding-block: var(--spacing-2, 8px);
}
.admin-data-table[data-narrow="true"] .openai-record-table td[data-lead] {
  flex: 0 0 100%;
  box-sizing: border-box;
}
.admin-data-table[data-narrow="true"] .openai-record-table td {
  padding-block: var(--spacing-1, 4px);
  text-align: start;
}
.admin-data-table[data-narrow="true"]
  .openai-record-table
  td:not([data-lead]):not(.admin-table-select) {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-2, 8px);
  padding-inline-start: 12px;
}
.admin-data-table[data-narrow="true"] .openai-mobile-label {
  display: inline;
  color: var(--color-text-secondary);
  flex: 0 0 auto;
  white-space: nowrap;
}
.admin-data-table[data-narrow="true"]
  .openai-record-table
  tr:has(.admin-table-select) {
  padding-inline-start: 44px;
}
.admin-data-table[data-narrow="true"]
  .openai-record-table
  td.admin-table-select {
  position: absolute;
  inset-inline-start: 0;
  top: var(--spacing-2, 8px);
  width: 44px;
}
.admin-data-table[data-narrow="true"] .openai-record-table td:not([data-lead]):not(.admin-table-select):has(.admin-table-value:empty),
.admin-data-table[data-narrow="true"] td:has(> .admin-table-value > .sr-only:only-child) { display: none; }
.admin-data-table[data-narrow="true"] td[data-column="summary"] {
  flex: 0 0 100%;
  box-sizing: border-box;
}
.admin-data-table[data-narrow="true"] td[data-column="summary"] .openai-mobile-label { display: none; }
.admin-data-table[data-narrow="true"] .editorial-record-summary {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: normal;
  overflow: hidden;
}
.admin-data-table[data-narrow="true"] tr:has(.workspace-row-mark) td:not([data-lead]):not(.admin-table-select) {
  padding-inline-start: 40px;
}

`;
export function tableResponsiveRules(scope: string, threshold: number): string {
  const selector = `.admin-data-table .openai-table-frame[data-table-scope="${scope}"]`;
  return `@container (max-width: ${threshold - 0.5}px) { ${REFLOW_CSS.replaceAll('.admin-data-table[data-narrow="true"]', selector)} }`;
}
