/**
 * The admin workspace kit: the page header, filter bar, table, row, cells,
 * state badges, detail lists, notices, loading skeleton, detail panel, times
 * and tier mark that Content, Data and Observability all render with.
 * Styling lives in workspace.css under `workspace-*` names, so a list looks
 * and behaves the same wherever it appears. Display names, app tiles and
 * device tiles come from lib/naming.ts; text formats from ./format.ts.
 *
 * The API, in the order a page uses it:
 *
 * | piece           | what it takes                                          |
 * |-----------------|--------------------------------------------------------|
 * | WorkspacePage   | title, count beside the H1, meta, badge, actions,      |
 * |                 | `status` beside the clock                              |
 * | FilterBar       | `search` (live, debounced) and FilterMenu children     |
 * | FilterMenu      | an icon-only menu: label, current value, isActive      |
 * | DataTable       | rows and Columns, `groupBy`, `foldGroup`               |
 * | RowTitle        | the lead cell: `mark` tile, title, line 2, phone `end` |
 * |                 | and `time`                                             |
 * | StateCell       | a state column's cell: never empty                     |
 * | StateBadge      | `domain` and `state`; default states render no chip    |
 * | StateTransition | `from` and `to` badges, for a change of state          |
 * | badgeFor        | the one state table: label, tone, isDefault, glyph     |
 * | DetailText      | a short detail that truncates, full text on hover      |
 * | Figure          | a count, with its noun when it has one                 |
 * | Duration        | a run's length: "84ms", "1m 24s"                       |
 * | DueTime         | the next run: "in 12m", "due now", "3m overdue"        |
 * | RelativeTime    | a live relative time with the absolute one as tooltip  |
 * | DayLabel        | a day group's heading: Today, Yesterday, Mon, Sep 21   |
 * | DayHeader       | the same as a heading, for lists that are not tables   |
 * | DefinitionList  | label and value pairs in two columns, stacked on phones|
 * | ValueChips      | an object as key and value chips, app keys as tiles    |
 * | CopyValue       | a short id or hash with a copy button                  |
 * | TechnicalSection| ids and hashes, collapsed, each with a copy button     |
 * | CompactTimeline | "Revision 1, Sep 22, 11:30" rows with a short hash     |
 * | StateNotice     | stands in for an empty, unconnected or failed table    |
 * | TierMark        | a tier as a globe, shield or lock glyph                |
 *
 * The table convention. The lead column (RowTitle) is the one flexible
 * column; a table may add one more flexible column, a DetailText, and the
 * two share the width the fixed columns leave, so there is no dead middle and
 * nothing overflows. Every other column is fixed at a CELL_WIDTHS width so the
 * same kind of column lines up across sections: the state (StateCell), times
 * (RelativeTime, DueTime), figures and durations (`numeric`, right-aligned in
 * tabular figures) and a lone tile such as a device, whose header is for
 * assistive technology only. No word is ever cut: a title too long for its
 * column wraps at a space, a DetailText with `lines` ends after a whole
 * word, and other cells stay on one line. A table with no flexible detail
 * column and short names caps its
 * lead at its widest content (`max`) and spreads the rest over its figure
 * columns (`spread`), so there is no dead middle either.
 * Grouped rows take `groupBy` and a `groupLabel` (DayLabel for activity);
 * `foldGroup` names the group that sits last and starts folded, such as
 * sources that were never connected.
 *
 * Tile tokens for a `mark`: `--row-mark-size` (24px, 28px at compact),
 * `--row-mark-glyph` (16px, 18px) and `--row-mark-radius` (0.3 of the size,
 * BrandTile's corner: 7.2px, 8.4px at compact). The page gutter is
 * `--admin-gutter` from styles/shell.css (12px at compact); compact lists
 * bleed past it.
 *
 * Layout ranges come from lib/breakpoints.ts: compact <= 640, medium 641 to
 * 1023, large 1024 to 1439, wide >= 1440. At compact a table is a full-bleed
 * list of two-line rows: the lead column only, with the header kept for
 * assistive technology, and no count strip.
 */
import React, {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Table, type TablePlugin } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowRightIcon,
  CaretRightIcon,
  CheckIcon,
  CircleDashedIcon,
  ClockCounterClockwiseIcon,
  CopySimpleIcon,
  FlaskIcon,
  GlobeSimpleIcon,
  LinkBreakIcon,
  LockSimpleIcon,
  MoonIcon,
  ShieldIcon,
  WarningCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { brandMark } from "@anipotts/brand/marks";
import { BREAKPOINTS, isBelow, type Breakpoint } from "../../lib/breakpoints";
import { relativeAgo, useLiveText } from "../../lib/live-clock";
import { appMark, countNoun, keyLabel } from "../../lib/naming";
import { sentenceCase } from "../../lib/sentence-case";
import { BrandTile } from "../BrandTile";
import {
  ADMIN_TIME_ZONE,
  clockText,
  countText,
  dayLabel,
  dueText,
  durationText,
  shortValue,
} from "./format";
import "./workspace.css";

/** Notice and chip copy never ends on a period. */
const unpunctuated = (text: string) => text.replace(/\.\s*$/, "");

/** Page title, its count, one supporting line and the page's own actions.
 * The title line has one fixed height, the largest action's (36px, 44px on
 * phones), and carries the actions, the page's live status chips and then
 * the live Eastern clock, whose right edge is the line's on every page. The
 * meta line hangs below it; what does not fit beside the clock drops to a
 * line of its own under it, right-aligned (workspace.css). */
export function WorkspacePage({
  title,
  count,
  meta,
  badge,
  actions,
  status,
  clock,
  children,
}: {
  title: string;
  /** How many records the page lists, beside the title. */
  count?: number;
  /** A fixed clock for the page (a fixture read at its own moment, a test):
   * the Eastern clock shows it and never ticks, like the page's ages. */
  clock?: number;
  /** One short status line, only when the state needs it. It is not a live
   * region, so a ticking age is never announced. */
  meta?: ReactNode;
  /** A chip beside the title, such as Sample data. */
  badge?: ReactNode;
  actions?: ReactNode;
  /** Live state chips for the whole page, such as Status's counts, right
   * beside the clock. */
  status?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <VStack gap={5} className="workspace-page">
      <VStack gap={1} className="workspace-page-header">
        <div className="workspace-page-line">
          <HStack
            gap={3}
            vAlign="center"
            wrap="wrap"
            className="workspace-page-title"
          >
            <Heading level={1}>{title}</Heading>
            {count !== undefined && (
              <Text color="secondary" className="workspace-count">
                {count}
              </Text>
            )}
            {badge}
          </HStack>
          <div className="workspace-page-end">
            {actions && (
              <HStack
                gap={2}
                vAlign="center"
                className="workspace-page-actions"
              >
                {actions}
              </HStack>
            )}
            {status && <div className="workspace-page-status">{status}</div>}
            <EasternClock now={clock} />
          </div>
        </div>
        {meta && (
          <Text
            type="supporting"
            color="secondary"
            className="workspace-page-meta"
          >
            {meta}
          </Text>
        )}
      </VStack>
      {children}
    </VStack>
  );
}

const EASTERN_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});
const EASTERN_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const EASTERN_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

/** Minutes east of UTC for a moment in New York: -240 in summer. */
function easternOffset(ms: number): number {
  const parts = Object.fromEntries(
    EASTERN_PARTS.formatToParts(ms).map((part) => [part.type, part.value]),
  );
  const local = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((local - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** "3:55:12 PM ET": the clock time in America/New_York, to the second. */
export function easternClockText(ms: number): string {
  return `${EASTERN_TIME.format(ms)} ET`;
}

/** "Tuesday, September 22, 2026, UTC-04:00": the day and the offset. */
export function easternClockTitle(ms: number): string {
  const offset = easternOffset(ms);
  const sign = offset < 0 ? "-" : "+";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return `${EASTERN_DATE.format(ms)}, UTC${sign}${hours}:${minutes}`;
}

/**
 * The live Eastern Time clock on every workspace page's title line. It reads
 * the one shared clock every relative time reads (lib/live-clock.ts), so
 * "12s ago" and the clock tick together and never disagree. Quiet: no label,
 * tabular figures, the full date and UTC offset as its tooltip. The server
 * writes its own second; the browser's replaces it on hydration.
 */
export function EasternClock({ now }: { now?: number }) {
  const text = useLiveText(easternClockText, Date.now(), now);
  const title = useLiveText((live) => easternClockTitle(live), Date.now(), now);
  return (
    <time className="workspace-clock" title={title} suppressHydrationWarning>
      {text}
    </time>
  );
}

/** Inside a section, a notice's title is one level below the section's. */
const SectionLevel = createContext<2 | 3>(2);

/** A titled part of a page, such as a group of rows on the overview. With
 * `href` the heading is the link to the section's own page. */
export function WorkspaceSection({
  title,
  href,
  meta,
  actions,
  children,
}: {
  title: string;
  href?: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <VStack gap={3} as="section" aria-labelledby={id}>
      <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Heading level={2} id={id}>
            {href ? (
              <a href={href} className="workspace-section-link">
                {title}
                <CaretRightIcon
                  weight="regular"
                  aria-hidden="true"
                  className="workspace-section-link-mark"
                />
              </a>
            ) : (
              title
            )}
          </Heading>
          {meta && (
            <Text type="supporting" color="secondary">
              {meta}
            </Text>
          )}
        </HStack>
        {actions && (
          <HStack gap={1} vAlign="center">
            {actions}
          </HStack>
        )}
      </HStack>
      <SectionLevel.Provider value={3}>{children}</SectionLevel.Provider>
    </VStack>
  );
}

/** How long typing rests before a live search runs. */
export const SEARCH_DEBOUNCE_MS = 200;

type SearchProps = {
  label: string;
  /** The search that is running, from the page's state or URL. */
  value: string;
  /** Runs as you type, once typing rests, and at once on Enter. */
  onChange: (value: string) => void;
  /** The field's clear button. Defaults to `onChange("")`. */
  onClear?: () => void;
  isBusy?: boolean;
  /** Shown but not usable yet, such as while a private session opens. */
  isDisabled?: boolean;
};

/**
 * One row: a live search that flexes, then the page's icon-only
 * FilterMenus. The field shows keystrokes at once and hands the query on
 * after SEARCH_DEBOUNCE_MS, or immediately on Enter or clear.
 */
export function FilterBar({
  search,
  children,
}: {
  search?: SearchProps;
  children?: ReactNode;
}) {
  return (
    <HStack
      as={search ? "form" : undefined}
      role={search ? "search" : undefined}
      gap={2}
      vAlign="center"
      className="workspace-filter-bar"
      onSubmit={
        search ? (event: React.FormEvent) => event.preventDefault() : undefined
      }
    >
      {search && <LiveSearch {...search} />}
      {children && (
        <HStack gap={1} vAlign="center" className="workspace-filters">
          {children}
        </HStack>
      )}
    </HStack>
  );
}

/** A search keyboard with no autocorrection. TextInput forwards no input
 * attributes, so they go on its input element directly. */
const SEARCH_HINTS: Record<string, string> = {
  inputmode: "search",
  enterkeyhint: "search",
  autocapitalize: "off",
  autocorrect: "off",
  autocomplete: "off",
  spellcheck: "false",
};
function searchHints(input: HTMLInputElement | null) {
  if (!input) return;
  for (const [name, value] of Object.entries(SEARCH_HINTS))
    input.setAttribute(name, value);
}

function LiveSearch({
  label,
  value,
  onChange,
  onClear,
  isBusy,
  isDisabled,
}: SearchProps) {
  const [draft, setDraft] = useState(value);
  const sent = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A timer runs the page's latest handler, not the one from the keystroke.
  const latest = useRef(onChange);
  latest.current = onChange;
  const cancel = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  /** Typing that lands back on the running query sends nothing; Enter always
   * runs the search, so it doubles as a refresh. */
  const send = (next: string, always = false) => {
    cancel();
    if (!always && next === sent.current) return;
    sent.current = next;
    latest.current(next);
  };
  // The page can change the query itself (a reset, back and forward).
  useEffect(() => {
    if (value === sent.current) return;
    cancel();
    sent.current = value;
    setDraft(value);
  }, [value]);
  useEffect(() => cancel, []);
  return (
    <TextInput
      className="workspace-search"
      label={label}
      isLabelHidden
      placeholder={label}
      startIcon="search"
      value={draft}
      hasClear
      isLoading={isBusy}
      isDisabled={isDisabled}
      ref={searchHints}
      onChange={(next: string, event: unknown) => {
        setDraft(next);
        if (next === "" && event === null) {
          cancel();
          sent.current = "";
          if (onClear) onClear();
          else onChange("");
          return;
        }
        cancel();
        timer.current = setTimeout(() => send(next), SEARCH_DEBOUNCE_MS);
      }}
      onEnter={() => send(draft, true)}
    />
  );
}

/**
 * An icon-only filter or sort menu for the FilterBar. Its name and tooltip
 * read "Status: Draft"; `isActive` marks a choice other than the default.
 */
export function FilterMenu({
  label,
  value,
  icon: Glyph,
  isActive = false,
  children,
}: {
  label: string;
  /** The current choice, as the menu names it. */
  value: string;
  icon: Icon;
  isActive?: boolean;
  children: ReactNode;
}) {
  const name = `${label}: ${value}`;
  return (
    <div className="workspace-filter-menu" data-active={isActive}>
      <DropdownMenu
        button={{
          label: name,
          tooltip: name,
          isIconOnly: true,
          icon: <Glyph weight="regular" aria-hidden="true" />,
          size: "sm",
          variant: "ghost",
        }}
        hasChevron={false}
        menuWidth="max-content"
      >
        {children}
      </DropdownMenu>
    </div>
  );
}

/** A column: the renderer, a width, and the range below which it hides. The
 * lead column always shows; at compact it is the only one, and the row
 * carries the rest through RowTitle's `mobile`, `end` and `time`. */
export type Column<T> = {
  key: string;
  header: ReactNode;
  /** Pixels (a CELL_WIDTHS width for a standard cell), or omitted to share
   * the remaining width. */
  width?: number;
  /** A flexible column's part (0 to 1) of the width the fixed columns
   * leave, so the lead keeps the rest: a detail column at 0.4 gives way
   * before the names beside it. Without it flexible columns split evenly. */
  share?: number;
  /** With `share`: pixels the column always leaves the lead (leadWidth), so
   * the detail gives way before a name would truncate. */
  reserve?: number;
  /** With `share`: the least the column keeps even when the lead's reserve
   * would take it, for cells that must never be cut (a row of chips). */
  min?: number;
  /** With `share`: what the column would like, such as the width that holds
   * its longest detail on two lines. It takes this before its even `share`
   * when the table has the room, but never out of the lead's `reserve`, so
   * a long detail wraps and clamps rather than cutting a name. */
  want?: number;
  /** On the lead, in a table with no shared column: the most it takes, its
   * widest content (leadWidth). The width past it goes evenly to the
   * `spread` columns, so a short-named table has no dead middle. */
  max?: number;
  /** With a fixed `width`: the column also takes an even part of the width
   * the lead leaves past its `max`. */
  spread?: boolean;
  align?: "start" | "end";
  /** Figures: right-aligned, header included, in tabular numerals. */
  numeric?: boolean;
  /** Hidden in every range narrower than this one. */
  hideBelow?: "large" | "wide";
  /** Gives way to the lead: in a range where the table is narrower than
   * the lead's `room` and the shown fixed columns, the column hides, lowest
   * order first, until the lead has its room. What it held moves to line 2
   * through YieldOnly, or stays in the row's panel. The rule is CSS the
   * server writes (a container query), so the first paint is the layout. */
  yieldOrder?: number;
  /** On the lead: the width its longest title needs (leadWidth), which the
   * `yieldOrder` columns give way to. */
  room?: number;
  render: (row: T) => ReactNode;
};

/** The fixed widths of the standard cells, cell inset included, so the same
 * kind of column lines up in every table and section. */
export const CELL_WIDTHS = {
  /** StateCell: the widest chip ("Superseded") with a record's tier glyph
   * beside it, so record, content and alert state columns line up. */
  state: 144,
  /** RelativeTime and DueTime, "Not recorded" included (85px at 14px),
   * whole even as the last column, whose end inset is 16px, not 12px. */
  time: 116,
  /** Figure and Duration. */
  figure: 80,
  /** A lone 24px tile, such as a device. */
  tile: 56,
} as const;

/** The least a flexible column is given before the table scrolls. */
const FLEX_MIN_WIDTH = 80;

/** Marks the heading row DataTable puts before each group, and the folded
 * group's row count and state. */
const GROUP = Symbol("workspace-group");
const FOLD = Symbol("workspace-fold");
type GroupRow = {
  [GROUP]: string;
  [FOLD]?: { count: number; open: boolean };
};
const isGroupRow = (row: object): row is GroupRow => GROUP in row;

/** The columns a range shows. */
const shownIn = <T,>(columns: readonly Column<T>[], range: Breakpoint) =>
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
function shareWidth(
  share: number,
  reserve = 0,
  min = FLEX_MIN_WIDTH,
  want?: number,
): React.CSSProperties {
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

/** The lead's inset, tile and gap around its title: 16px in, a 24px tile,
 * 12px to the title and 12px out. */
const LEAD_CHROME = 64;
/** Advance widths, in px, of printable ASCII (space to tilde) in the row
 * title's face: Instrument Sans at 14px and weight 500, as Chromium draws
 * it. Anything else counts as a wide 10px. */
const TITLE_ADVANCES = [
  2.8, 4, 5.8, 10.1, 8.7, 11, 10.7, 3.4, 5.9, 5.9, 5.9, 7.5, 3.7, 7, 3.7, 6.2,
  9.4, 5.5, 7.7, 8.1, 8.5, 8.1, 8.5, 7.7, 8.3, 8.6, 3.7, 3.7, 7.5, 7.5, 7.5, 8,
  12, 10.2, 9, 10.4, 10.6, 8.9, 8.4, 10.7, 10.2, 3.6, 6.2, 9.8, 8.2, 12.6, 10.2,
  11.1, 9.3, 11.2, 9.2, 8.7, 9.2, 9.9, 10.2, 15.2, 9.8, 9.6, 8.8, 5.9, 6.2, 5.9,
  7.5, 6.2, 5, 7.6, 8.6, 7.6, 8.6, 7.9, 5.1, 8.6, 8.5, 3.5, 3.5, 7.7, 3.5, 13,
  8.5, 8.3, 8.6, 8.6, 5.4, 6.8, 5.5, 8.3, 7.4, 11, 8, 7.4, 7.1, 5.9, 3.3, 5.9,
  7.5,
];
/** Kerning and rendering differences, so the estimate errs wide. */
const TITLE_SLACK = 1.04;

/** A title's width in the row's face, estimated from its characters. */
export function titleWidth(title: string): number {
  let width = 0;
  for (const char of title) {
    const code = char.charCodeAt(0) - 32;
    width += TITLE_ADVANCES[code] ?? 10;
  }
  return width * TITLE_SLACK;
}

/** A digit's advance in tabular numerals at 14px, as every time, figure and
 * duration cell draws them (font-variant-numeric: tabular-nums): wider than
 * a proportional "1" (5.5px), so a time's column is sized from this. */
const TABULAR_DIGIT = 8.4;

/** A time's or figure's width at 14px in tabular numerals ("Before Sep 11,
 * 11:11"): its letters at the title advances, its digits at the tabular
 * one, so a column sized from it never cuts a digit. */
export function figureWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.charCodeAt(0) - 32;
    width +=
      char >= "0" && char <= "9" ? TABULAR_DIGIT : (TITLE_ADVANCES[code] ?? 10);
  }
  return width * TITLE_SLACK;
}

/** A cell's inline inset: 12px each side. */
const CELL_INSET = 24;
/** A chip's inset, dot or glyph and gap around its 12px label. */
const CHIP_CHROME = 32;
/** A quiet default state's dot box (StateCell). */
const QUIET_STATE = 24;

/** A state chip's width: its label at 12px (the title advances scaled from
 * 14px), its dot or glyph and its inset; a default state's quiet dot. */
export function chipWidth(label: string, quiet = false): number {
  return quiet
    ? QUIET_STATE
    : Math.ceil((titleWidth(label) * 12) / 14 + CHIP_CHROME);
}

/** A state column's width: the widest cell its rows draw (StateCell), with
 * the cell inset, so a column of dots is not as wide as a column that holds
 * "Degraded". `extra` adds cells drawn another way (a past state's words). */
export function stateWidth(
  domain: BadgeDomain,
  states: Iterable<string>,
  extra: Iterable<number> = [],
): number {
  let widest = 0;
  for (const state of states) {
    const badge = badgeFor(domain, state);
    widest = Math.max(widest, chipWidth(badge.label, badge.isDefault));
  }
  for (const width of extra) widest = Math.max(widest, width);
  return Math.ceil(CELL_INSET + widest);
}

/**
 * The width a lead column needs to show its longest title whole, for a
 * `share` column's `reserve`. The server cannot measure text, so it is
 * estimated from the face's advances (titleWidth), and kept between `min`
 * and `max` so a very long title truncates rather than squeezing the detail
 * away.
 */
export function leadWidth(
  titles: Iterable<string>,
  { min = 160, max = 360 }: { min?: number; max?: number } = {},
): number {
  let widest = 0;
  for (const title of titles) widest = Math.max(widest, titleWidth(title));
  const width = Math.ceil(LEAD_CHROME + widest);
  return Math.min(max, Math.max(min, width));
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
function spreadWidth(width: number, leadMax: number): React.CSSProperties {
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

/** What a `yieldOrder` column holds, on the lead's line 2 where the column
 * gives way (and on phones, where no column but the lead shows). */
export function YieldOnly({
  column,
  children,
}: {
  column: string;
  children: ReactNode;
}) {
  return (
    <span className="workspace-yield-only" data-yield-for={column}>
      {children}
    </span>
  );
}

/** The scroll wrapper is a tab stop only while its table overflows it. */
function useOverflow() {
  const [overflowing, setOverflowing] = useState(false);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof ResizeObserver === "undefined") return;
    const measure = () =>
      setOverflowing(node.scrollWidth > node.clientWidth + 1);
    const next = new ResizeObserver(measure);
    next.observe(node);
    const table = node.querySelector("table");
    if (table) next.observe(table);
    observer.current = next;
    measure();
  }, []);
  return [overflowing, ref] as const;
}

/**
 * The one table: a raised surface on wide screens and a full-bleed list at
 * compact, compact rows with no rules, and a count strip that screen readers
 * hear. Widths go on the header cells here rather than through Astryx, so
 * the table's minimum width counts only the columns each range shows.
 */
export function DataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  rowKey,
  label,
  noun,
  figures,
  footer = true,
  interactive = true,
  groupBy,
  groupLabel = (key) => key,
  foldGroup,
  foldCount,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: keyof T & string;
  label: string;
  /** Singular and plural for the count strip. */
  noun: [string, string];
  /** Extra non-zero figures after the count. */
  figures?: Array<[label: string, value: number]>;
  footer?: boolean;
  /** Rows open something: the whole row takes the hover and the tap.
   * Read-only tables (Activity) keep rows still. */
  interactive?: boolean;
  /** One heading row per group key, in the order each group's first row
   * arrives, so one table (one header, one tab stop) holds every group. */
  groupBy?: (row: T) => string;
  groupLabel?: (key: string) => ReactNode;
  /** The group that sits after the others and starts folded; its heading
   * shows its row count and opens it. Needs `groupBy`. */
  foldGroup?: string;
  /** What the folded heading counts when its rows are not the things it
   * holds (a family row folds several sources); its row count otherwise. */
  foldCount?: number;
}) {
  const [overflowing, wrapperRef] = useOverflow();
  const [foldOpen, setFoldOpen] = useState(false);
  // Read at click time, so the plugin never rebuilds for the handler.
  const toggleFold = useRef(() => setFoldOpen((open) => !open));
  // The heading renderer is read at render time, so an inline one never
  // rebuilds the plugin.
  const labelFor = useRef(groupLabel);
  labelFor.current = groupLabel;
  const shape = columns
    .map(
      (column) =>
        `${column.key}:${column.width}:${column.share}:${column.reserve}:${column.min}:${column.want}:${column.max}:${column.spread}:${column.hideBelow}:${column.numeric}`,
    )
    .join(",");
  const plugin = useMemo((): TablePlugin<T> => {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const leadMax = columns.find(
      (column) => column.width === undefined && column.max !== undefined,
    )?.max;
    const hiding = (key: string) => {
      const column = byKey.get(key);
      return {
        // Names the column, so a page's own rules (a container query) can
        // move it without reaching into cell order.
        "data-column": key,
        ...(column?.hideBelow ? { "data-hide-below": column.hideBelow } : {}),
        ...(column?.numeric ? { "data-numeric": "" } : {}),
      };
    };
    return {
      transformBodyRow: (props, item) =>
        isGroupRow(item)
          ? {
              ...props,
              htmlProps: {
                ...props.htmlProps,
                "data-group-row": "",
              } as typeof props.htmlProps,
              // One cell in the lead column. A span would count the columns
              // a range hides and hand them the spare width.
              children: (
                <th scope="rowgroup" className="workspace-group-row">
                  {item[FOLD] ? (
                    <button
                      type="button"
                      className="workspace-group-toggle"
                      aria-expanded={item[FOLD].open}
                      onClick={() => toggleFold.current()}
                    >
                      <CaretRightIcon
                        weight="regular"
                        aria-hidden="true"
                        className="workspace-group-caret"
                      />
                      <span className="workspace-group-label">
                        {labelFor.current(item[GROUP])}
                      </span>
                      <span className="workspace-count">
                        {item[FOLD].count}
                      </span>
                    </button>
                  ) : (
                    labelFor.current(item[GROUP])
                  )}
                </th>
              ),
            }
          : props,
      transformHeaderCell: (props, column) => {
        const { width, share, reserve, min, want, spread } =
          byKey.get(column.key) ?? {};
        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            ...hiding(column.key),
            style: {
              ...props.htmlProps.style,
              ...(width !== undefined
                ? spread && leadMax !== undefined
                  ? spreadWidth(width, leadMax)
                  : { width, minWidth: width }
                : share !== undefined
                  ? shareWidth(share, reserve, min, want)
                  : { width: "auto", minWidth: FLEX_MIN_WIDTH }),
            },
          } as typeof props.htmlProps,
        };
      },
      transformBodyCell: (props, column) => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          ...hiding(column.key),
        } as typeof props.htmlProps,
      }),
      transformScrollWrapper: (props) => ({
        ...props,
        htmlProps: {
          ...props.htmlProps,
          ref: wrapperRef,
          tabIndex: overflowing ? 0 : undefined,
          role: overflowing ? "group" : undefined,
          "aria-label": overflowing ? label : undefined,
        },
      }),
    };
    // `shape` stands for the columns: consumers rebuild them every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, overflowing, label, wrapperRef]);
  const data = groupBy
    ? withGroupRows(
        rows,
        rowKey,
        groupBy,
        foldGroup === undefined
          ? undefined
          : { key: foldGroup, open: foldOpen, count: foldCount },
      )
    : rows;
  const minimum = tableMinWidths(columns);
  const spreads = columns.some((column) => column.spread)
    ? tableSpreadCounts(columns)
    : null;
  const fixed =
    spreads || columns.some((column) => column.share !== undefined)
      ? tableFixedWidths(columns)
      : null;
  const frameStyle = Object.fromEntries(
    BREAKPOINTS.flatMap((range) => [
      [`--workspace-table-min-${range}`, `${minimum[range]}px`],
      ...(fixed
        ? [[`--workspace-table-fixed-${range}`, `${fixed[range]}px`]]
        : []),
      ...(spreads
        ? [[`--workspace-table-spread-${range}`, String(spreads[range] || 1)]]
        : []),
    ]),
  ) as React.CSSProperties;
  const count = `${rows.length} ${rows.length === 1 ? noun[0] : noun[1]}`;
  const scope = useId();
  const yieldRules = tableYieldRules(columns, scope);
  return (
    <VStack
      gap={0}
      className="workspace-table"
      data-footer={footer ? "true" : "false"}
      data-interactive={interactive ? "true" : "false"}
    >
      {yieldRules && <style>{yieldRules}</style>}
      <div
        className="workspace-table-frame"
        style={frameStyle}
        data-yield-scope={yieldRules ? scope : undefined}
      >
        <Table
          className="workspace-table-grid"
          data={data}
          idKey={rowKey}
          density="compact"
          dividers="none"
          aria-label={label}
          plugins={{ workspace: plugin }}
          columns={columns.map((column, index) => ({
            key: column.key,
            header: column.header,
            align: column.numeric ? "end" : column.align,
            // Past the lead, a cell's content sits in a box of line 1's
            // height, so where the lead carries a line 2 (medium) every
            // column reads on line 1 (workspace.css).
            renderCell: (row: T) =>
              isGroupRow(row) ? null : index === 0 ? (
                column.render(row)
              ) : (
                <span className="workspace-cell">{column.render(row)}</span>
              ),
          }))}
        />
      </div>
      {footer && (
        <HStack
          gap={5}
          wrap="wrap"
          vAlign="center"
          className="workspace-table-footer"
        >
          <Text
            type="supporting"
            color="secondary"
            role="status"
            aria-live="polite"
            aria-label={count}
            className="workspace-table-count"
          >
            {count} in view
          </Text>
          {figures
            ?.filter(([, value]) => value > 0)
            .map(([name, value]) => (
              <Text
                key={name}
                type="supporting"
                color="secondary"
                className="workspace-table-figure"
              >
                <strong>{value}</strong> {name}
              </Text>
            ))}
        </HStack>
      )}
    </VStack>
  );
}

/** The rows under one heading row per group. Groups keep the order their
 * first row arrives in and gather every row that shares their key, rows
 * keeping their own order within it, so a group never heads the table twice.
 * A folded group moves after the others; while it is closed only its heading
 * shows. */
function withGroupRows<T extends Record<string, unknown>>(
  rows: T[],
  rowKey: keyof T & string,
  groupBy: (row: T) => string,
  fold?: { key: string; open: boolean; count?: number },
): T[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupBy(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const order = [...groups.keys()];
  if (fold && groups.has(fold.key))
    order.push(...order.splice(order.indexOf(fold.key), 1));
  const out: T[] = [];
  for (const key of order) {
    const members = groups.get(key)!;
    const isFold = fold !== undefined && key === fold.key;
    out.push({
      [rowKey]: `group:${key}`,
      [GROUP]: key,
      ...(isFold
        ? {
            [FOLD]: { count: fold.count ?? members.length, open: fold.open },
          }
        : {}),
    } as unknown as T);
    if (!isFold || fold.open) out.push(...members);
  }
  return out;
}

/** A title that ends in an ellipsis, keeping `keep` (its end, ", ap-mini")
 * whole. With `wrap`, a title too long for its
 * column wraps at a space onto a second line instead, so no word is ever
 * cut; `keep` stays on the line of the word before it. */
export function TitleText({
  title,
  keep,
  wrap = false,
  className = "workspace-row-title",
}: {
  title: string;
  keep?: string;
  wrap?: boolean;
  className?: string;
}) {
  const wraps = wrap ? "" : undefined;
  if (!keep || !title.endsWith(keep) || keep === title)
    return (
      <span className={className} data-wrap={wraps}>
        {title}
      </span>
    );
  return (
    <span className={className} data-keep="" data-wrap={wraps}>
      <span className="workspace-title-base">
        {title.slice(0, -keep.length)}
      </span>
      <span className="workspace-title-keep">{keep}</span>
    </span>
  );
}

/**
 * A row's lead cell. Line 1 is the mark tile, the title and, at compact, the
 * `end` slot and a right-aligned time. Line 2 is `secondary` at every width
 * and, at compact, `mobile` before it: only what adds information there.
 *
 * `mark` fills the tile: a BrandTile, or any node sized to the slot. The slot
 * sets `--row-mark-size` (24px, 28px at compact), `--row-mark-glyph` and
 * `--row-mark-radius`, and paints the neutral fill a full-bleed app icon
 * covers. Without a mark, `icon` draws a Phosphor glyph in the same tile.
 */
export function RowTitle({
  icon: Glyph,
  mark,
  kind,
  title,
  keep,
  href,
  onSelect,
  isPressed,
  controls,
  secondary,
  mobile,
  mobileBelow = "compact",
  end,
  time,
  external = false,
  linkLabel,
  tooltip,
  anchorId,
  wrap = true,
}: {
  icon?: Icon;
  mark?: ReactNode;
  /** The row's kind, as the tile's tooltip and for assistive technology. */
  kind: string;
  title: string;
  /** The end of `title` that never truncates, such as ", ap-mini" on a name
   * two hosts share: the rest of the title gives way first. */
  keep?: string;
  /** The row's destination. The whole row opens it; the link itself wraps
   * only the title text. */
  href?: string;
  /** Opens the row in place. With an href, a plain click opens in place and
   * a modified click (new tab) follows the link. */
  onSelect?: (trigger: HTMLElement) => void;
  isPressed?: boolean;
  controls?: string;
  /** Line 2 at every width. */
  secondary?: ReactNode;
  /** Line 2 at compact, before `secondary`: a non-default state, a reason. */
  mobile?: ReactNode;
  /** The range below which `mobile` shows. "large" also shows it at medium,
   * for a row whose detail column drops there; wrap what medium's columns
   * still show (a state chip) in CompactOnly. */
  mobileBelow?: "compact" | "large";
  /** Line 1's trailing slot at compact, before the time. */
  end?: ReactNode;
  /** Line 1's right-aligned time at compact. */
  time?: string | number | null;
  /** The destination is outside admin: it opens in a new tab. */
  external?: boolean;
  /** The link's accessible name when it differs from the title. */
  linkLabel?: string;
  /** Extra detail on hover, kept out of the row so rows stay short. */
  tooltip?: string;
  /** An id for the row, so other pages can link to it. */
  anchorId?: string;
  /** A title too long for its column wraps at a space rather than ending
   * in an ellipsis (TitleText), so no word is ever cut; on by default. */
  wrap?: boolean;
}) {
  const select = onSelect
    ? (event: React.MouseEvent<HTMLElement>) => {
        if (
          href &&
          (event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey ||
            event.button !== 0)
        )
          return;
        event.preventDefault();
        onSelect(event.currentTarget);
      }
    : undefined;
  const label = <TitleText title={title} keep={keep} wrap={wrap} />;
  const trailing = (end != null || time != null) && (
    <Text type="supporting" color="secondary" className="workspace-row-end">
      {end}
      {time != null && <RelativeTime value={time} />}
    </Text>
  );
  return (
    <div className="workspace-row" id={anchorId}>
      {(mark || Glyph) && (
        <span className="workspace-row-mark" title={kind}>
          {mark ?? (Glyph && <Glyph weight="regular" aria-hidden="true" />)}
          <span className="sr-only">{kind}</span>
        </span>
      )}
      <div className="workspace-row-body">
        <div className="workspace-row-line">
          {href ? (
            <a
              href={href}
              className="workspace-row-link"
              data-row-link=""
              target={external ? "_blank" : undefined}
              rel={external ? "noopener noreferrer" : undefined}
              referrerPolicy={external ? "no-referrer" : undefined}
              aria-label={linkLabel}
              title={tooltip}
              onClick={select}
              aria-current={onSelect && isPressed ? "true" : undefined}
              aria-controls={controls}
            >
              {label}
            </a>
          ) : onSelect ? (
            <button
              type="button"
              className="workspace-row-link"
              data-row-link=""
              title={tooltip}
              onClick={select}
              aria-pressed={isPressed}
              aria-controls={controls}
            >
              {label}
            </button>
          ) : (
            <span className="workspace-row-text" title={tooltip}>
              {label}
            </span>
          )}
          {trailing}
        </div>
        {(secondary || mobile) && (
          <div
            className="workspace-row-meta"
            data-compact-only={secondary ? undefined : "true"}
            data-below={mobileBelow === "large" ? "large" : undefined}
          >
            {mobile && <span className="workspace-row-detail">{mobile}</span>}
            {secondary && (
              <Text
                type="supporting"
                color="secondary"
                className="workspace-row-secondary"
              >
                {typeof secondary === "string" ? (
                  <WordSafeText title={secondary}>{secondary}</WordSafeText>
                ) : (
                  secondary
                )}
              </Text>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Part of a row's `mobile` line that only compact shows, because the
 * medium range still has its column (a state chip beside its State
 * column). */
export function CompactOnly({ children }: { children: ReactNode }) {
  return <span className="workspace-compact-only">{children}</span>;
}

/** Part of a row's `mobile` line that only medium shows, because compact
 * carries it elsewhere and large has its column (a device tile). */
export function MediumOnly({ children }: { children: ReactNode }) {
  return <span className="workspace-medium-only">{children}</span>;
}

/** `rest` is a host that sleeps on purpose: blue, so it reads apart from
 * healthy green and from an unknown's neutral. */
export type Tone =
  "positive" | "neutral" | "warning" | "critical" | "calm" | "rest";

const TONES: Record<
  Tone,
  {
    color: "green" | "orange" | "red" | "blue" | "default";
    dot: "success" | "warning" | "error" | "accent" | "neutral";
  }
> = {
  positive: { color: "green", dot: "success" },
  neutral: { color: "default", dot: "neutral" },
  warning: { color: "orange", dot: "warning" },
  critical: { color: "red", dot: "error" },
  calm: { color: "default", dot: "neutral" },
  rest: { color: "blue", dot: "accent" },
};

type Badge = {
  label: string;
  tone: Tone;
  /** The state a record is normally in. It gets no chip, only its name for
   * assistive technology, so a chip always means an exception. */
  isDefault?: true;
  icon?: Icon;
};

/** Every workspace state, once. Unlisted states read as neutral exceptions. */
const BADGES = {
  content: {
    published: { label: "Published", tone: "positive", isDefault: true },
    listed: { label: "Listed", tone: "positive", isDefault: true },
    featured: { label: "Featured", tone: "positive" },
    scheduled: { label: "Scheduled", tone: "neutral" },
    draft: { label: "Draft", tone: "neutral" },
    hidden: { label: "Hidden from site", tone: "neutral" },
  },
  ops: {
    ok: { label: "OK", tone: "positive", isDefault: true },
    degraded: { label: "Degraded", tone: "warning" },
    failing: { label: "Failing", tone: "critical" },
    stale: {
      label: "Stale",
      tone: "warning",
      icon: ClockCounterClockwiseIcon,
    },
    // Asleep and unknown each have their own glyph and colour, so neither
    // reads as OK or as the other.
    asleep: { label: "Asleep", tone: "rest", icon: MoonIcon },
    unknown: { label: "Unknown", tone: "neutral", icon: CircleDashedIcon },
  },
  record: {
    observed: { label: "Observed", tone: "neutral", isDefault: true },
    confirmed: { label: "Confirmed", tone: "positive" },
    superseded: { label: "Superseded", tone: "calm" },
    provisional: { label: "Provisional", tone: "neutral" },
    conflict: { label: "Conflict", tone: "warning" },
  },
  freshness: {
    fresh: { label: "Fresh", tone: "positive", isDefault: true },
    stale: {
      label: "Stale",
      tone: "warning",
      icon: ClockCounterClockwiseIcon,
    },
    // No freshness budget: liveness only, so freshness cannot be judged.
    unknown: { label: "Unknown", tone: "neutral", icon: CircleDashedIcon },
  },
  alert: {
    firing: { label: "Firing", tone: "critical" },
    resolved: { label: "Resolved", tone: "neutral" },
  },
} satisfies Record<string, Record<string, Badge>>;

export type BadgeDomain = keyof typeof BADGES;

/** A state's label, tone and whether it is the default, from one table. */
export function badgeFor(domain: BadgeDomain, state: string): Badge {
  return (
    (BADGES[domain] as Record<string, Badge>)[state] ?? {
      label: sentenceCase(state || "unknown"),
      tone: "neutral",
    }
  );
}

/** A state's chip: its label always as text, its glyph or dot for colour.
 * The mark carries the tone (`data-tone`), since the chip takes no data
 * attributes of its own. */
function Chip({ badge, icon }: { badge: Badge; icon?: ReactNode }) {
  const { color, dot } = TONES[badge.tone];
  const Glyph = badge.icon;
  return (
    <Token
      size="sm"
      color={color}
      label={badge.label}
      className="workspace-state"
      icon={
        icon ??
        (Glyph ? (
          <Glyph
            weight="regular"
            aria-hidden="true"
            className="workspace-state-mark"
            data-tone={badge.tone}
          />
        ) : (
          <StatusDot
            variant={dot}
            label={badge.label}
            aria-hidden="true"
            data-tone={badge.tone}
          />
        ))
      }
    />
  );
}

/**
 * The one status chip. With a `domain` and `state` it reads the badge table
 * and renders nothing visible for a default state (Published, OK, Observed),
 * only its name for assistive technology. With `tone` and `label` it always
 * renders. The label is always text; the dot adds colour and is hidden from
 * assistive technology.
 */
export function StateBadge(
  props:
    | { domain: BadgeDomain; state: string; tone?: never; label?: never }
    | { tone: Tone; label: string; icon?: ReactNode; domain?: never },
) {
  if (props.domain === undefined)
    return (
      <Chip
        badge={{ tone: props.tone, label: props.label }}
        icon={props.icon}
      />
    );
  const badge = badgeFor(props.domain, props.state);
  if (badge.isDefault) return <span className="sr-only">{badge.label}</span>;
  return <Chip badge={badge} />;
}

/**
 * A state column's cell, never empty: a default state (OK, Fresh, Observed)
 * is a quiet dot where a chip's dot would sit, named by its tooltip and for
 * assistive technology; every other state is its chip. Unknown and Asleep
 * carry their own glyphs, so neither reads as OK.
 */
export function StateCell({
  domain,
  state,
}: {
  domain: BadgeDomain;
  state: string;
}) {
  const badge = badgeFor(domain, state);
  if (!badge.isDefault) return <Chip badge={badge} />;
  return (
    <span
      className="workspace-state-quiet"
      data-tone={badge.tone}
      role="img"
      aria-label={badge.label}
      title={badge.label}
    >
      <StatusDot
        variant={TONES[badge.tone].dot}
        label={badge.label}
        aria-hidden="true"
      />
    </span>
  );
}

/** A change of state: the state it left, then the one it entered, both as
 * chips (OK included). A first sighting has no state to leave. */
export function StateTransition({
  domain,
  from,
  via,
  to,
}: {
  domain: BadgeDomain;
  from: string | null | undefined;
  /** A state passed through on the way, for a change that came back. */
  via?: string | null;
  to: string;
}) {
  const step = (
    <>
      <ArrowRightIcon
        weight="regular"
        aria-hidden="true"
        className="workspace-transition-mark"
      />
      <span className="sr-only">to</span>
    </>
  );
  return (
    <span className="workspace-transition">
      {from ? (
        <>
          <Chip badge={badgeFor(domain, from)} />
          {step}
        </>
      ) : (
        <span className="sr-only">First seen</span>
      )}
      {via && (
        <>
          <Chip badge={badgeFor(domain, via)} />
          {step}
        </>
      )}
      <Chip badge={badgeFor(domain, to)} />
    </span>
  );
}

/** A word longer than this is not kept whole: it may break anywhere, so a
 * hash or a path never overflows a narrow cell. */
const WORD_KEEP_MAX = 24;

/** A text's words as unbreakable boxes with real spaces between them, so a
 * line that runs out ends in an ellipsis after a whole word, never inside a
 * word or a number ("expired 59d ago", never "expired 59…"), and a word
 * that does not fit wraps whole (onto a clamp's hidden line when clamped). */
function wholeWords(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(/(\s+)/).forEach((part, index) => {
    if (!part) return;
    if (/^\s+$/.test(part)) {
      out.push(" ");
      return;
    }
    if (part.length > WORD_KEEP_MAX) out.push(part);
    else
      out.push(
        <span key={index} className="workspace-word">
          {part}
        </span>,
      );
  });
  return out;
}

/** A text on `lines` lines that ends after a whole word (wholeWords), for a
 * cell that is not a DetailText (a summary). Its container keeps its own
 * type; this only lays out and clamps the words. */
export function WordSafeText({
  children,
  lines = 1,
  title,
}: {
  children: string;
  lines?: 1 | 2;
  /** The full text on hover, where no container carries it. */
  title?: string;
}) {
  return (
    <span className="workspace-detail-words" data-lines={lines} title={title}>
      {wholeWords(children)}
    </span>
  );
}

/** A short detail beside a row's title: one line that ends in an ellipsis,
 * its full text on hover. Muted: the title leads the row. With `lines`, a
 * string detail wraps onto that many lines and ends after a whole word
 * (wholeWords), its full text on hover; its words keep their spaces, so it
 * reads and copies as one text. On a row's line 2 it reads whole. */
export function DetailText({
  children,
  tooltip,
  lines,
}: {
  children: ReactNode;
  /** The full text when the child is not a string, or says more. */
  tooltip?: string | null;
  lines?: 1 | 2;
}) {
  const title = tooltip ?? (typeof children === "string" ? children : null);
  if (lines && typeof children === "string")
    return (
      <span
        className="workspace-detail-text"
        data-lines={lines}
        title={title || undefined}
      >
        <WordSafeText lines={lines}>{children}</WordSafeText>
      </span>
    );
  return (
    <span className="workspace-detail-text" title={title || undefined}>
      {/* Where it wraps (a panel's list), a word, a number or an id such
          as "pc.reader-key" or "2026-10-01" never splits at its hyphen. */}
      {typeof children === "string" ? wholeWords(children) : children}
    </span>
  );
}

/** What a figure cell shows without a value: the given text, muted, or
 * nothing visible and "Not recorded" for assistive technology. */
function NoValue({ text }: { text?: string }) {
  return text ? (
    <Text color="secondary" className="workspace-figure">
      {text}
    </Text>
  ) : (
    <span className="sr-only">Not recorded</span>
  );
}

/** A count in tabular figures, with its noun when it has one ("44 visits"). */
export function Figure({
  value,
  noun,
  empty,
}: {
  value: number | null | undefined;
  noun?: readonly [one: string, many: string] | null;
  empty?: string;
}) {
  if (value == null || !Number.isFinite(value)) return <NoValue text={empty} />;
  return <span className="workspace-figure">{countText(value, noun)}</span>;
}

/** How long something took: "84ms", "8.4s", "1m 24s". Give `ms` (an event's
 * duration) or `seconds` (a status row's `last_duration_s`). */
export function Duration({
  ms,
  seconds,
  empty,
}: {
  ms?: number | null;
  seconds?: number | null;
  empty?: string;
}) {
  const text = durationText(ms ?? (seconds == null ? null : seconds * 1000));
  if (text === null) return <NoValue text={empty} />;
  return <span className="workspace-figure workspace-duration">{text}</span>;
}

/** The due text is the time element's own child, so a render on either
 * side of a minute boundary is not a hydration error. */
function LiveDue({
  at,
  now,
  graceS,
}: {
  at: number;
  now?: number;
  graceS: number;
}) {
  const text = useLiveText(
    (live) => dueText(at, live, graceS).text,
    Date.now(),
    now,
  );
  const absolute = `Due ${absoluteTime(at)}`;
  return (
    <time
      dateTime={new Date(at).toISOString()}
      title={absolute}
      aria-label={absolute}
      className="workspace-time workspace-due"
      data-overdue={text.endsWith("overdue") ? "true" : undefined}
      suppressHydrationWarning
    >
      {text}
    </time>
  );
}

/** When something is next due, live from the shared clock: "in 12m", then
 * "due now" for `graceS` seconds (a minute by default, since System samples
 * every 15 seconds), then "3m overdue" in the warning ink. */
function DueTimeCell({
  value,
  now,
  graceS = 60,
  empty,
}: {
  value: string | number | null | undefined;
  now?: number;
  graceS?: number;
  empty?: string;
}) {
  const ms = typeof value === "number" ? value : Date.parse(value ?? "");
  if (value == null || value === "" || !Number.isFinite(ms))
    return <NoValue text={empty} />;
  return <LiveDue at={ms} now={now} graceS={graceS} />;
}

export const DueTime = memo(
  DueTimeCell,
  (previous, next) =>
    previous.value === next.value &&
    previous.now === next.now &&
    previous.graceS === next.graceS &&
    previous.empty === next.empty,
);

function LiveDay({ day, now }: { day: string; now?: number }) {
  const text = useLiveText((live) => dayLabel(day, live), Date.now(), now);
  return <>{text}</>;
}

/** A day group's heading text from a `dayKey`: "Today", "Yesterday", "Mon,
 * Sep 21". Live, so Today turns into Yesterday at midnight. */
export function DayLabel({ day, now }: { day: string; now?: number }) {
  return (
    <time
      dateTime={day || undefined}
      className="workspace-day"
      suppressHydrationWarning
    >
      <LiveDay day={day} now={now} />
    </time>
  );
}

/** A day heading for an activity list that is not a table. In a DataTable,
 * pass `groupBy={(row) => dayKey(row.at)}` and `groupLabel` a DayLabel. */
export function DayHeader({
  day,
  now,
  level = 3,
}: {
  day: string;
  now?: number;
  level?: 2 | 3 | 4;
}) {
  return (
    <Heading level={level} className="workspace-day-header">
      <DayLabel day={day} now={now} />
    </Heading>
  );
}

type NoticeKind = "empty" | "not-connected" | "error";
const NOTICE_ICONS: Record<NoticeKind, Icon> = {
  empty: CircleDashedIcon,
  "not-connected": LinkBreakIcon,
  error: WarningCircleIcon,
};

/** Replaces a table when there is nothing to show: no rows, no connection,
 * or a failed read. Same surface as the table it stands in for. */
export function StateNotice({
  kind,
  title,
  action,
  icon: Glyph = NOTICE_ICONS[kind],
  headingLevel,
}: {
  kind: NoticeKind;
  title: string;
  action?: ReactNode;
  icon?: Icon;
  headingLevel?: 2 | 3;
}) {
  const sectionLevel = useContext(SectionLevel);
  const level = headingLevel ?? sectionLevel;
  return (
    <div
      className="workspace-notice"
      data-kind={kind}
      role={kind === "error" ? "alert" : undefined}
    >
      <span className="workspace-notice-icon">
        <Glyph weight="regular" size={24} aria-hidden="true" />
      </span>
      <VStack gap={1} className="workspace-notice-text">
        <Heading level={level} className="workspace-notice-title">
          {unpunctuated(title)}
        </Heading>
        {action && (
          <HStack gap={2} wrap="wrap" className="workspace-notice-action">
            {action}
          </HStack>
        )}
      </VStack>
    </div>
  );
}

/** Above retained content: the rows below are not current, or a part failed. */
export function InlineNotice({
  tone,
  title,
  action,
  icon: Glyph = WarningCircleIcon,
}: {
  tone: "info" | "warning" | "error";
  title: string;
  action?: ReactNode;
  icon?: Icon;
}) {
  return (
    <Banner
      status={tone}
      container="section"
      title={unpunctuated(title)}
      icon={<Glyph weight="regular" />}
      endContent={action}
    />
  );
}

/** Loading rows shaped like the rows that replace them, tile and all. Only
 * the status is spoken; Astryx Skeleton honours reduced motion. */
export function LoadingSkeleton({
  label,
  rows = 6,
  columns = 3,
}: {
  label: string;
  rows?: number;
  columns?: number;
}) {
  return (
    <VStack
      gap={0}
      role="status"
      aria-label={`Loading ${label}`}
      className="workspace-skeleton"
    >
      <Text className="sr-only">Loading {label}</Text>
      <VStack gap={0} aria-hidden="true">
        {Array.from({ length: rows }, (_, row) => (
          <HStack
            key={row}
            gap={4}
            className="workspace-skeleton-row"
            vAlign="center"
          >
            <HStack gap={3} vAlign="center" className="workspace-skeleton-lead">
              <Skeleton
                width="var(--row-mark-size)"
                height="var(--row-mark-size)"
                radius={1}
                index={row}
              />
              <Skeleton
                width={`${60 - (row % 3) * 12}%`}
                height="var(--spacing-4)"
                index={row}
              />
            </HStack>
            {Array.from({ length: columns - 1 }, (_, index) => (
              <Skeleton
                key={index}
                width="12%"
                height="var(--spacing-4)"
                index={row}
                className="workspace-skeleton-cell"
              />
            ))}
          </HStack>
        ))}
      </VStack>
    </VStack>
  );
}

/** One record, beside or in place of its list: a way back, the title with
 * its badge, a metadata grid, then the body. */
export function DetailPanel({
  title,
  badge,
  back,
  fields,
  children,
  id,
  panelRef,
}: {
  title: string;
  badge?: ReactNode;
  back?: ReactNode;
  fields?: Array<[label: string, value: ReactNode]>;
  children?: ReactNode;
  id?: string;
  panelRef?: React.Ref<HTMLElement>;
}) {
  return (
    <section
      id={id}
      ref={panelRef}
      tabIndex={-1}
      aria-label={`${title} details`}
      className="workspace-detail"
    >
      <VStack gap={5}>
        {back}
        <HStack gap={3} vAlign="center" wrap="wrap">
          <Heading level={2}>{title}</Heading>
          {badge}
        </HStack>
        {fields && fields.length > 0 && (
          <MetadataList
            className="workspace-detail-fields"
            columns="multi"
            label={{ position: "top" }}
          >
            {fields.map(([name, value]) => (
              <MetadataListItem key={name} label={name}>
                {typeof value === "string" ? (
                  <Text wordBreak="break-word">{value}</Text>
                ) : (
                  value
                )}
              </MetadataListItem>
            ))}
          </MetadataList>
        )}
        {children}
      </VStack>
    </section>
  );
}

const ABSOLUTE = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: ADMIN_TIME_ZONE,
});
const DATE_ONLY = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: ADMIN_TIME_ZONE,
});
const TIME_ONLY = new Intl.DateTimeFormat("en-US", {
  timeStyle: "short",
  timeZone: ADMIN_TIME_ZONE,
});

/** The absolute time, Eastern (the page clock's zone) and UTC, for a
 * tooltip and accessible name. */
function absoluteTime(ms: number): string {
  return `${ABSOLUTE.format(ms)} ET, ${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function LiveAgo({ at, now }: { at: number; now?: number }) {
  const text = useLiveText((live) => relativeAgo(at, live), Date.now(), now);
  return <>{text}</>;
}

/** A time as people read it: relative and live from the one shared clock,
 * with the absolute local and UTC time as its tooltip and accessible name.
 * Never a raw ISO string. Tabular and on one line. `date` and `time` show
 * the calendar day or the clock time instead, for lists grouped by day. */
function RelativeTimeCell({
  value,
  empty = "Not recorded",
  format = "relative",
  label,
  now,
}: {
  value: string | number | null | undefined;
  empty?: string;
  format?: "relative" | "date" | "time";
  /** What the time is, such as "Local edit", before the absolute time. */
  label?: string;
  /** A fixed clock (a fixture read at its own moment, a test): the text
   * never ticks. */
  now?: number;
}) {
  const ms = typeof value === "number" ? value : Date.parse(value ?? "");
  if (value == null || value === "" || !Number.isFinite(ms))
    return (
      <Text color="secondary" className="workspace-time">
        {empty}
      </Text>
    );
  const absolute = label ? `${label}: ${absoluteTime(ms)}` : absoluteTime(ms);
  return (
    <time
      dateTime={new Date(ms).toISOString()}
      title={absolute}
      aria-label={format === "relative" ? absolute : undefined}
      className="workspace-time"
      suppressHydrationWarning
    >
      {format === "date" ? (
        DATE_ONLY.format(ms)
      ) : format === "time" ? (
        TIME_ONLY.format(ms)
      ) : (
        <LiveAgo at={ms} now={now} />
      )}
    </time>
  );
}

/** Skips renders while the value is unchanged; the shared clock still
 * advances the relative text. */
export const RelativeTime = memo(
  RelativeTimeCell,
  (previous, next) =>
    previous.value === next.value &&
    previous.empty === next.empty &&
    previous.format === next.format &&
    previous.label === next.label &&
    previous.now === next.now,
);

const TIER_GLYPHS: Record<string, Icon> = {
  open: GlobeSimpleIcon,
  public: GlobeSimpleIcon,
  restricted: ShieldIcon,
  internal: ShieldIcon,
  private: LockSimpleIcon,
  intimate: LockSimpleIcon,
  closed: LockSimpleIcon,
};

/** A record's classification as a glyph: a globe when open, a shield when
 * restricted, a lock when private. The name is its accessible name and
 * tooltip, never visible text. */
export function TierMark({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  const name = `${sentenceCase(tier)} tier`;
  const Glyph = TIER_GLYPHS[tier.toLowerCase()] ?? CircleDashedIcon;
  return (
    <span
      className="workspace-tier"
      data-tier={tier.toLowerCase()}
      role="img"
      aria-label={name}
      title={name}
    >
      <Glyph weight="regular" aria-hidden="true" />
    </span>
  );
}

/** Where a development page's data came from: the committed synthetic
 * samples, or a local replay of payloads captured from System (ignored by
 * git, never committed; lib/shell-fixtures.ts). */
export type FixtureOrigin = {
  replay: boolean;
  /** A replay read at its capture's moment (`?fixture=replay-frozen`);
   * otherwise a replay runs on the real clock. */
  frozen?: boolean;
  capturedAt: string | null;
  /** Which payloads a replay stood in for, each with its capture stamp.
   * Absent: every payload the page draws is the replay's. */
  payloads?: Partial<Record<"snapshot" | "events" | "sources", string | null>>;
};
export const SAMPLE_ORIGIN: FixtureOrigin = Object.freeze({
  replay: false,
  capturedAt: null,
});
export const FixtureOriginContext = createContext<FixtureOrigin>(SAMPLE_ORIGIN);

/** The one mark for development data: "Sample data" for the synthetic
 * samples, and a distinct "Replay" with the capture's age where the page
 * draws a replayed payload, so a replayed capture never passes for either
 * the sample or the live system, and a synthetic page never reads as a
 * replay. `from` names the payloads the page draws (none: only synthetic
 * samples). The screenshot guard refuses a page that carries Replay. */
export function SampleBadge({
  from,
}: {
  from?: readonly ("snapshot" | "events" | "sources")[];
}) {
  const origin = useContext(FixtureOriginContext);
  const drawn = from ?? [];
  const replayed = !origin.replay
    ? []
    : origin.payloads
      ? drawn.filter((payload) => payload in origin.payloads!)
      : drawn;
  if (replayed.length)
    return (
      <ReplayBadge
        capturedAt={
          replayed
            .map((payload) => origin.payloads?.[payload])
            .find((stamp) => typeof stamp === "string") ?? origin.capturedAt
        }
      />
    );
  return (
    <span className="workspace-fixture" data-fixture="sample">
      <Token
        size="sm"
        color="default"
        label="Sample data"
        className="workspace-sample"
        icon={<FlaskIcon weight="regular" size={14} aria-hidden="true" />}
      />
    </span>
  );
}

/** A capture's moment in Eastern Time, as the page's clock reads. */
const EASTERN_STAMP = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "Sep 22, 2:01 PM ET", assembled from its parts: engines join the date
 * and the time differently (WebKit writes "Sep 22 at 2:01 PM"), and the
 * server's text must be the browser's. */
function easternStamp(ms: number): string {
  const part = Object.fromEntries(
    EASTERN_STAMP.formatToParts(ms).map((item) => [item.type, item.value]),
  );
  return `${part.month} ${part.day}, ${part.hour}:${part.minute} ${part.dayPeriod} ET`;
}

function ReplayBadge({ capturedAt }: { capturedAt: string | null }) {
  const at = Date.parse(capturedAt ?? "");
  // A replay's page runs its clock from the capture's own moment, so an age
  // measured on the real clock would disagree with the clock beside it: the
  // capture reads as the Eastern moment it was taken.
  const stamp = Number.isFinite(at) ? easternStamp(at) : "";
  return (
    <span
      className="workspace-fixture"
      data-fixture="replay"
      title={capturedAt ? `Captured ${capturedAt}` : undefined}
    >
      <Token
        size="sm"
        color="default"
        label={stamp ? `Replay, captured ${stamp}` : "Replay"}
        className="workspace-sample"
        icon={
          <ClockCounterClockwiseIcon
            weight="regular"
            size={14}
            aria-hidden="true"
          />
        }
      />
    </span>
  );
}

/**
 * Label and value pairs in two aligned columns: a muted label column, then
 * the value, which wraps rather than overflows. The pairs stack, label over
 * value, on phones and in a narrow panel. Empty values are left out.
 */
export function DefinitionList({
  items,
  label,
}: {
  items: ReadonlyArray<readonly [label: string, value: ReactNode]>;
  /** The list's accessible name, when a heading does not give it one. */
  label?: string;
}) {
  const shown = items.filter(
    ([, value]) => value !== null && value !== undefined && value !== "",
  );
  if (!shown.length) return null;
  return (
    <dl className="workspace-definitions" aria-label={label}>
      {shown.map(([name, value]) => (
        <div key={name} className="workspace-definition">
          <dt>{name}</dt>
          {/* A text value wraps between whole words: an id or a date
              ("pc.reader-key", "2026-10-01") never splits at a hyphen. */}
          <dd>{typeof value === "string" ? wholeWords(value) : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** "Record ID" as a verb's object: "Copy record ID". */
const lowerFirst = (text: string) =>
  text.charAt(0).toLowerCase() + text.slice(1);

/**
 * A hash or id as a row shows it: shortened (a digest to its first 12
 * characters, anything else to the cell's ellipsis), the full value as the
 * tooltip, and a copy button that copies all of it. It never overflows.
 */
export function CopyValue({
  value,
  label,
  display,
}: {
  value: string;
  /** What the value is, for the button's name: "Record ID". */
  label: string;
  /** Shown in place of the shortened value. */
  display?: string;
}) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  const name = `Copy ${lowerFirst(label)}`;
  return (
    <span className="workspace-copy-value">
      <code className="workspace-copy-text" title={value}>
        {display ?? shortValue(value)}
      </code>
      <Button
        label={name}
        tooltip={copied ? "Copied" : name}
        isIconOnly
        size="sm"
        variant="ghost"
        icon={
          copied ? (
            <CheckIcon weight="regular" aria-hidden="true" />
          ) : (
            <CopySimpleIcon weight="regular" aria-hidden="true" />
          )
        }
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(
            () => setCopied(true),
            () => undefined,
          );
        }}
      />
      <span className="sr-only" role="status">
        {copied ? "Copied" : ""}
      </span>
    </span>
  );
}

/** A record's technical fields, collapsed by default: ids, hashes, source
 * references and versions, each short with a copy button. Empty ones are
 * left out, and with none there is no section. */
export function TechnicalSection({
  items,
  title = "Technical",
}: {
  items: ReadonlyArray<{
    label: string;
    value?: string | null;
    display?: string;
    /** Drawn in place of a copy value: a short vocabulary word, chips. */
    node?: ReactNode;
  }>;
  title?: string;
}) {
  const shown = items.filter((item) => Boolean(item.node ?? item.value));
  if (!shown.length) return null;
  return (
    <Collapsible
      trigger={<Text>{title}</Text>}
      defaultIsOpen={false}
      className="workspace-technical"
    >
      <DefinitionList
        items={shown.map((item) => [
          item.label,
          item.node ?? (
            <CopyValue
              key={item.label}
              value={item.value!}
              label={item.label}
              display={item.display}
            />
          ),
        ])}
      />
    </Collapsible>
  );
}

/** A value inside a chip: counts with the field's noun, booleans as Yes and
 * No, anything nested as compact JSON. */
function chipText(
  value: unknown,
  noun: readonly [string, string] | null,
): string {
  if (typeof value === "number")
    return Number.isFinite(value) ? countText(value, noun) : String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined) return "None";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * An object as small inline chips, one per key. A key that names an app is
 * its tile: `{"chrome": 44}` in `browser_visits` reads [Chrome] "44 visits".
 * Other keys read as their label ("Title screened 3"). Counts sort largest
 * first. `field` is the object's own key, which names the list and gives
 * counts their noun; `noun` overrides it.
 */
export function ValueChips({
  value,
  field,
  noun,
  label,
  raw = false,
}: {
  value: unknown;
  field?: string;
  noun?: readonly [one: string, many: string] | null;
  label?: string;
  /** Keys are names as written (domains, repositories), not field names. */
  raw?: boolean;
}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return null;
  const unit = noun !== undefined ? noun : field ? countNoun(field) : null;
  const counts = entries.every(([, entry]) => typeof entry === "number");
  const ordered = counts
    ? [...entries].sort(
        ([a, left], [b, right]) =>
          (right as number) - (left as number) || a.localeCompare(b),
      )
    : entries;
  return (
    <ul
      className="workspace-chips"
      aria-label={label ?? (field ? keyLabel(field) : undefined)}
    >
      {ordered.map(([key, entry]) => {
        const app = appMark(key);
        const text = chipText(entry, unit);
        const name = app
          ? (brandMark(app)?.label ?? key)
          : raw
            ? key
            : keyLabel(key);
        return (
          <li
            key={key}
            className="workspace-chip"
            data-app={app ? "true" : undefined}
            title={`${name}: ${text}`}
          >
            {app ? (
              <BrandTile id={app} size={20} label={name} />
            ) : (
              <span className="workspace-chip-key">{name}</span>
            )}
            <span className="workspace-chip-value">{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** A clock time in Eastern Time, as the page's clock reads; the server
 * writes the text the browser keeps. */
function LocalClock({ ms, now }: { ms: number; now?: number }) {
  return <>{clockText(ms, now)}</>;
}

/**
 * A record's history as one short line per entry: "Revision 1, Sep 22,
 * 11:30", then its short hash with a copy button. The current entry leads
 * with a quiet accent dot. The newest comes first when the entries do.
 */
export function CompactTimeline({
  items,
  label,
  hashLabel = "Hash",
  now,
}: {
  items: ReadonlyArray<{
    id: string;
    title: string;
    at?: string | number | null;
    hash?: string | null;
    current?: boolean;
  }>;
  /** The list's accessible name: "Revision history". */
  label: string;
  /** What the hashes are, for their copy buttons: "Source version". */
  hashLabel?: string;
  now?: number;
}) {
  if (!items.length) return null;
  // With a current entry, every entry keeps the dot's slot so titles align.
  const marked = items.some((item) => item.current);
  return (
    <ol
      className="workspace-timeline"
      aria-label={label}
      data-marked={marked ? "true" : "false"}
    >
      {items.map((item) => {
        const ms =
          typeof item.at === "number" ? item.at : Date.parse(item.at ?? "");
        return (
          <li
            key={item.id}
            className="workspace-timeline-item"
            data-current={item.current ? "true" : undefined}
          >
            {item.current ? (
              <span
                className="workspace-timeline-current"
                role="img"
                aria-label="Current"
                title="Current"
              >
                <StatusDot
                  variant="accent"
                  label="Current"
                  aria-hidden="true"
                />
              </span>
            ) : (
              marked && (
                <span
                  className="workspace-timeline-current"
                  aria-hidden="true"
                />
              )
            )}
            <span className="workspace-timeline-text">
              <span className="workspace-timeline-title">{item.title}</span>
              {Number.isFinite(ms) && (
                <>
                  {", "}
                  <time
                    dateTime={new Date(ms).toISOString()}
                    title={absoluteTime(ms)}
                    className="workspace-time"
                    suppressHydrationWarning
                  >
                    <LocalClock ms={ms} now={now} />
                  </time>
                </>
              )}
            </span>
            {item.hash && <CopyValue value={item.hash} label={hashLabel} />}
          </li>
        );
      })}
    </ol>
  );
}
