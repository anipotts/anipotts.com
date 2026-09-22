/**
 * The admin workspace kit: the page header, filter bar, table, row, state
 * badge, notices, loading skeleton, detail panel, times and tier mark that
 * Content, Data and Observability all render with. Styling lives in
 * workspace.css under `workspace-*` names, so a list looks and behaves the
 * same wherever it appears.
 *
 * The API, in the order a page uses it:
 *
 * | piece           | what it takes                                          |
 * |-----------------|--------------------------------------------------------|
 * | WorkspacePage   | title, count beside the H1, meta, badge, actions       |
 * | FilterBar       | `search` (live, debounced) and FilterMenu children     |
 * | FilterMenu      | an icon-only menu: label, current value, isActive      |
 * | DataTable       | rows and Columns; a column's `hideBelow` names a range |
 * | RowTitle        | the lead cell: `mark` tile, title, line 2, phone `end` |
 * |                 | and `time`                                             |
 * | StateBadge      | `domain` and `state`; default states render no chip    |
 * | badgeFor        | the one state table: label, tone, isDefault, glyph     |
 * | StateNotice     | stands in for an empty, unconnected or failed table    |
 * | RelativeTime    | a live relative time with the absolute one as tooltip  |
 * | TierMark        | a tier as a globe, shield or lock glyph                |
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
  CircleDashedIcon,
  ClockCounterClockwiseIcon,
  FlaskIcon,
  GlobeSimpleIcon,
  LinkBreakIcon,
  LockSimpleIcon,
  MoonIcon,
  ShieldIcon,
  WarningCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { BREAKPOINTS, isBelow, type Breakpoint } from "../../lib/breakpoints";
import { relativeAgo, useLiveText } from "../../lib/live-clock";
import { sentenceCase } from "../../lib/sentence-case";
import "./workspace.css";

/** Notice and chip copy never ends on a period. */
const unpunctuated = (text: string) => text.replace(/\.\s*$/, "");

/** Page title, its count, one supporting line and the page's own actions. */
export function WorkspacePage({
  title,
  count,
  meta,
  badge,
  actions,
  children,
}: {
  title: string;
  /** How many records the page lists, beside the title. */
  count?: number;
  /** One short status line, only when the state needs it. It is not a live
   * region, so a ticking age is never announced. */
  meta?: ReactNode;
  /** A chip beside the title, such as Sample data. */
  badge?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <VStack gap={5} className="workspace-page">
      <HStack
        gap={3}
        hAlign="between"
        vAlign="center"
        className="workspace-page-header"
      >
        <VStack gap={1} className="workspace-page-title">
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={1}>{title}</Heading>
            {count !== undefined && (
              <Text color="secondary" className="workspace-count">
                {count}
              </Text>
            )}
            {badge}
          </HStack>
          {meta && (
            <Text type="supporting" color="secondary">
              {meta}
            </Text>
          )}
        </VStack>
        {actions && (
          <HStack gap={2} vAlign="center" className="workspace-page-actions">
            {actions}
          </HStack>
        )}
      </HStack>
      {children}
    </VStack>
  );
}

/** Inside a section, a notice's title is one level below the section's. */
const SectionLevel = createContext<2 | 3>(2);

/** A titled part of a page, such as a group of rows on the overview. */
export function WorkspaceSection({
  title,
  meta,
  actions,
  children,
}: {
  title: string;
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
            {title}
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

function LiveSearch({ label, value, onChange, onClear, isBusy }: SearchProps) {
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
  /** Pixels, or omitted to share the remaining width. */
  width?: number;
  align?: "start" | "end";
  /** Hidden in every range narrower than this one. */
  hideBelow?: "large" | "wide";
  render: (row: T) => ReactNode;
};

/** The least a flexible column is given before the table scrolls. */
const FLEX_MIN_WIDTH = 80;

/** Marks the heading row DataTable puts before each group. */
const GROUP = Symbol("workspace-group");
type GroupRow = { [GROUP]: string };
const isGroupRow = (row: object): row is GroupRow => GROUP in row;

/** The table's minimum width in each range, from its visible columns only. */
export function tableMinWidths<T>(
  columns: readonly Column<T>[],
): Record<Breakpoint, number> {
  const at = (range: Breakpoint) =>
    range === "compact"
      ? 0
      : columns
          .filter(
            (column) =>
              column.hideBelow === undefined ||
              !isBelow(range, column.hideBelow),
          )
          .reduce((sum, column) => sum + (column.width ?? FLEX_MIN_WIDTH), 0);
  return Object.fromEntries(
    BREAKPOINTS.map((range) => [range, at(range)]),
  ) as Record<Breakpoint, number>;
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
  /** Rows arrive in group order; a heading row starts each run of rows that
   * share a key, so one table (one header, one tab stop) holds every group. */
  groupBy?: (row: T) => string;
  groupLabel?: (key: string) => ReactNode;
}) {
  const [overflowing, wrapperRef] = useOverflow();
  // The heading renderer is read at render time, so an inline one never
  // rebuilds the plugin.
  const labelFor = useRef(groupLabel);
  labelFor.current = groupLabel;
  const shape = columns
    .map((column) => `${column.key}:${column.width}:${column.hideBelow}`)
    .join(",");
  const plugin = useMemo((): TablePlugin<T> => {
    const byKey = new Map(columns.map((column) => [column.key, column]));
    const hiding = (key: string) => {
      const below = byKey.get(key)?.hideBelow;
      return below ? { "data-hide-below": below } : {};
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
                  {labelFor.current(item[GROUP])}
                </th>
              ),
            }
          : props,
      transformHeaderCell: (props, column) => {
        const width = byKey.get(column.key)?.width;
        return {
          ...props,
          htmlProps: {
            ...props.htmlProps,
            ...hiding(column.key),
            style: {
              ...props.htmlProps.style,
              ...(width === undefined
                ? { width: "auto", minWidth: FLEX_MIN_WIDTH }
                : { width, minWidth: width }),
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
  const data = groupBy ? withGroupRows(rows, rowKey, groupBy) : rows;
  const minimum = tableMinWidths(columns);
  const frameStyle = Object.fromEntries(
    BREAKPOINTS.map((range) => [
      `--workspace-table-min-${range}`,
      `${minimum[range]}px`,
    ]),
  ) as React.CSSProperties;
  const count = `${rows.length} ${rows.length === 1 ? noun[0] : noun[1]}`;
  return (
    <VStack
      gap={0}
      className="workspace-table"
      data-footer={footer ? "true" : "false"}
      data-interactive={interactive ? "true" : "false"}
    >
      <div className="workspace-table-frame" style={frameStyle}>
        <Table
          className="workspace-table-grid"
          data={data}
          idKey={rowKey}
          density="compact"
          dividers="none"
          aria-label={label}
          plugins={{ workspace: plugin }}
          columns={columns.map((column) => ({
            key: column.key,
            header: column.header,
            align: column.align,
            renderCell: (row: T) =>
              isGroupRow(row) ? null : column.render(row),
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

/** The rows with a heading row before each run that shares a group key. */
function withGroupRows<T extends Record<string, unknown>>(
  rows: T[],
  rowKey: keyof T & string,
  groupBy: (row: T) => string,
): T[] {
  const out: T[] = [];
  let previous: string | undefined;
  for (const row of rows) {
    const key = groupBy(row);
    if (key !== previous)
      out.push({ [rowKey]: `group:${key}`, [GROUP]: key } as unknown as T);
    previous = key;
    out.push(row);
  }
  return out;
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
  href,
  onSelect,
  isPressed,
  controls,
  secondary,
  mobile,
  end,
  time,
  external = false,
  linkLabel,
  tooltip,
  anchorId,
}: {
  icon?: Icon;
  mark?: ReactNode;
  /** The row's kind, as the tile's tooltip and for assistive technology. */
  kind: string;
  title: string;
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
  const label = <span className="workspace-row-title">{title}</span>;
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
          >
            {mobile && <span className="workspace-row-detail">{mobile}</span>}
            {secondary && (
              <Text
                type="supporting"
                color="secondary"
                className="workspace-row-secondary"
              >
                {secondary}
              </Text>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** A record's type: its glyph and name as one compact chip. */
export function KindBadge({
  icon: Glyph,
  label,
}: {
  icon: Icon;
  label: string;
}) {
  return (
    <Token
      size="sm"
      color="default"
      label={label}
      className="workspace-kind"
      icon={<Glyph weight="regular" size={14} aria-hidden="true" />}
    />
  );
}

export type Tone = "positive" | "neutral" | "warning" | "critical" | "calm";

const TONES: Record<
  Tone,
  {
    color: "green" | "orange" | "red" | "default";
    dot: "success" | "warning" | "error" | "neutral";
  }
> = {
  positive: { color: "green", dot: "success" },
  neutral: { color: "default", dot: "neutral" },
  warning: { color: "orange", dot: "warning" },
  critical: { color: "red", dot: "error" },
  calm: { color: "default", dot: "neutral" },
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
    asleep: { label: "Asleep", tone: "calm", icon: MoonIcon },
    unknown: { label: "Unknown", tone: "neutral" },
  },
  record: {
    observed: { label: "Observed", tone: "neutral", isDefault: true },
    confirmed: { label: "Confirmed", tone: "positive" },
    superseded: { label: "Superseded", tone: "calm" },
  },
  freshness: {
    fresh: { label: "Fresh", tone: "positive", isDefault: true },
    stale: {
      label: "Stale",
      tone: "warning",
      icon: ClockCounterClockwiseIcon,
    },
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
  const badge: Badge =
    props.domain !== undefined
      ? badgeFor(props.domain, props.state)
      : { tone: props.tone, label: props.label };
  if (badge.isDefault) return <span className="sr-only">{badge.label}</span>;
  const { color, dot } = TONES[badge.tone];
  const Glyph = badge.icon;
  const custom = props.domain === undefined ? props.icon : undefined;
  return (
    <Token
      size="sm"
      color={color}
      label={badge.label}
      className="workspace-state"
      icon={
        custom ??
        (Glyph ? (
          <Glyph
            weight="regular"
            aria-hidden="true"
            className="workspace-state-mark"
          />
        ) : (
          <StatusDot variant={dot} label={badge.label} aria-hidden="true" />
        ))
      }
    />
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
});
const DATE_ONLY = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });
const TIME_ONLY = new Intl.DateTimeFormat("en-US", { timeStyle: "short" });

/** The absolute time, local and UTC, for a tooltip and accessible name. */
export function absoluteTime(ms: number): string {
  return `${ABSOLUTE.format(ms)} local, ${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
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

/** The one mark for synthetic development data. */
export function SampleBadge() {
  return (
    <Token
      size="sm"
      color="default"
      label="Sample data"
      className="workspace-sample"
      icon={<FlaskIcon weight="regular" size={14} aria-hidden="true" />}
    />
  );
}
