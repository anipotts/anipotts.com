/**
 * The admin workspace kit: the page header, filter bar, table, row, state
 * badge, notices, loading skeleton, detail panel, times and tier swatch that
 * Content, Data and Observability all render with. Content's library is the
 * reference; every other workspace uses these same pieces so only the data
 * shape differs. Styling lives in workspace.css and reuses the library's
 * classes, so a table looks and behaves the same wherever it appears.
 */
import React, {
  createContext,
  memo,
  useContext,
  useId,
  type ReactNode,
} from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import {
  FlaskIcon,
  LinkBreakIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { relativeAgo, useLiveText } from "../../lib/live-clock";
import "./workspace.css";

/** Page title, one supporting line and the page's own actions. */
export function WorkspacePage({
  title,
  meta,
  badge,
  actions,
  children,
}: {
  title: string;
  /** One short status line, only when the state needs it. */
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
            {badge}
          </HStack>
          {meta && (
            <Text type="supporting" color="secondary" role="status">
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

type SearchProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Present when the search runs on submit rather than as you type. */
  onSubmit?: () => void;
  isBusy?: boolean;
};

/** One search field, then the filter and sort menus, on one row. */
export function FilterBar({
  search,
  children,
}: {
  search?: SearchProps;
  children?: ReactNode;
}) {
  const field = search && (
    <TextInput
      className="editorial-library-search"
      label={search.label}
      isLabelHidden
      placeholder={search.label}
      startIcon="search"
      value={search.value}
      onChange={search.onChange}
      hasClear
    />
  );
  const filters = children && (
    <HStack
      gap={2}
      hAlign="start"
      vAlign="center"
      className="editorial-filter-row editorial-library-filters"
    >
      {children}
    </HStack>
  );
  if (search?.onSubmit)
    return (
      <HStack
        as="form"
        role="search"
        gap={3}
        wrap="wrap"
        vAlign="center"
        className="editorial-library-toolbar workspace-filter-bar"
        onSubmit={(event: React.FormEvent) => {
          event.preventDefault();
          search.onSubmit?.();
        }}
      >
        {field}
        <HStack
          gap={2}
          hAlign="start"
          vAlign="center"
          className="editorial-filter-row editorial-library-filters"
        >
          <Button
            type="submit"
            label="Search"
            size="sm"
            variant="secondary"
            isIconOnly
            tooltip="Search"
            icon={<MagnifyingGlassIcon weight="regular" aria-hidden="true" />}
            isLoading={search.isBusy}
          />
          {children}
        </HStack>
      </HStack>
    );
  return (
    <HStack
      gap={3}
      wrap="wrap"
      vAlign="center"
      className="editorial-library-toolbar workspace-filter-bar"
    >
      {field}
      {filters}
    </HStack>
  );
}

/** A column: the renderer, a width, and the widths below which it hides. The
 * first and last columns always show; on phones the row carries the rest. */
export type Column<T> = {
  key: string;
  header: ReactNode;
  /** Pixels, or omitted to share the remaining width. */
  width?: number;
  align?: "start" | "end";
  hideBelow?: 1440 | 1280 | 1024;
  render: (row: T) => ReactNode;
};

/**
 * The one table: a raised surface, compact rows with no rules, a sticky
 * header, and a count strip under it that screen readers hear.
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
  /** Rows open something: the whole row takes the hover and the click.
   * Read-only tables (Status, Activity, Alerts) keep rows still. */
  interactive?: boolean;
}) {
  const id = useId();
  const hiding = columns
    .map((column, index) => [column.hideBelow, index + 1] as const)
    .filter(([below]) => below !== undefined);
  return (
    <VStack
      gap={0}
      className="admin-table-surface workspace-table"
      data-footer={footer ? "true" : "false"}
      data-interactive={interactive ? "true" : "false"}
    >
      {hiding.length > 0 && (
        <style>
          {hiding
            .map(
              ([below, nth]) =>
                `@media (max-width:${below! - 1}px){[data-workspace-table="${id}"] :is(th,td):nth-child(${nth}){display:none}}`,
            )
            .join("")}
        </style>
      )}
      <div data-workspace-table={id} className="workspace-table-frame">
        <Table
          className="editorial-record-table"
          data={rows}
          idKey={rowKey}
          density="compact"
          dividers="none"
          hasHover={interactive}
          aria-label={label}
          columns={columns.map((column) => ({
            key: column.key,
            header: column.header,
            width:
              column.width === undefined
                ? proportional(1, { minWidth: 80 })
                : pixel(column.width),
            align: column.align,
            renderCell: column.render,
          }))}
        />
      </div>
      {footer && (
        <HStack
          gap={5}
          wrap="wrap"
          vAlign="center"
          className="admin-table-footer"
        >
          <Text
            type="supporting"
            color="secondary"
            role="status"
            aria-live="polite"
            aria-label={`${rows.length} ${rows.length === 1 ? noun[0] : noun[1]}`}
            className="editorial-record-count"
          >
            {rows.length}
            <Text
              type="supporting"
              color="secondary"
              className="editorial-record-count-label"
            >
              {" "}
              {rows.length === 1 ? noun[0] : noun[1]} in view
            </Text>
          </Text>
          {figures
            ?.filter(([, value]) => value > 0)
            .map(([name, value]) => (
              <Text
                key={name}
                type="supporting"
                color="secondary"
                className="admin-table-figure"
              >
                <strong>{value}</strong> {name}
              </Text>
            ))}
        </HStack>
      )}
    </VStack>
  );
}

/** A row's lead cell: glyph, title, one secondary line, and on phones the
 * meta the hidden columns carry on wider screens. */
export function RowTitle({
  icon: Glyph,
  kind,
  title,
  href,
  onSelect,
  isPressed,
  controls,
  secondary,
  mobile,
  external = false,
  linkLabel,
  tooltip,
  anchorId,
}: {
  icon: Icon;
  /** The row's kind, as a tooltip and for assistive technology. */
  kind: string;
  title: string;
  /** The row's destination. The whole row opens it; the link itself wraps
   * only the title text, so its focus ring fits the text. */
  href?: string;
  /** Opens the row in place. With an href, a plain click opens in place and
   * a modified click (new tab) follows the link. */
  onSelect?: (trigger: HTMLElement) => void;
  isPressed?: boolean;
  controls?: string;
  secondary?: ReactNode;
  mobile?: ReactNode;
  /** The destination is outside admin: it opens in a new tab. */
  external?: boolean;
  /** The link's accessible name when it differs from the title. */
  linkLabel?: string;
  /** Extra detail on hover, kept out of the row so rows stay one line. */
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
  const label = <span className="record-link-text">{title}</span>;
  return (
    <HStack
      gap={3}
      vAlign="center"
      className="editorial-record-heading"
      id={anchorId}
    >
      <span className="editorial-record-icon" title={kind}>
        <Glyph weight="regular" size={20} aria-hidden="true" />
        <Text className="sr-only">{kind}</Text>
      </span>
      <VStack gap={0} className="editorial-record-content">
        {href ? (
          <a
            href={href}
            className="record-link"
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
            className="record-link"
            data-row-link=""
            onClick={select}
            aria-pressed={isPressed}
            aria-controls={controls}
          >
            {label}
          </button>
        ) : (
          <Text weight="medium" className="workspace-row-title">
            {title}
          </Text>
        )}
        {secondary && (
          <Text
            type="supporting"
            color="secondary"
            className="workspace-row-secondary"
          >
            {secondary}
          </Text>
        )}
        {mobile && (
          <HStack
            gap={2}
            wrap="wrap"
            vAlign="center"
            className="editorial-mobile-status"
          >
            {mobile}
          </HStack>
        )}
      </VStack>
    </HStack>
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

/** The one status chip. The label is always text; the dot adds colour and
 * is hidden from assistive technology. */
export function StateBadge({
  tone,
  label,
  icon,
}: {
  tone: Tone;
  label: string;
  icon?: ReactNode;
}) {
  const { color, dot } = TONES[tone];
  return (
    <Token
      size="sm"
      color={color}
      label={label}
      className="workspace-state"
      icon={
        icon ?? <StatusDot variant={dot} label={label} aria-hidden="true" />
      }
    />
  );
}

type NoticeKind = "empty" | "not-connected" | "error";
const NOTICE_ICONS: Record<NoticeKind, Icon> = {
  empty: MagnifyingGlassIcon,
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
          {title}
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
      title={title}
      icon={<Glyph weight="regular" />}
      endContent={action}
    />
  );
}

/** Loading rows shaped like the table that replaces them. Only the status
 * is spoken; Astryx Skeleton honours reduced motion. */
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
      className="admin-table-surface workspace-skeleton"
    >
      <Text className="sr-only">Loading {label}</Text>
      <VStack gap={0} aria-hidden="true">
        <HStack gap={4} className="workspace-skeleton-row" vAlign="center">
          <Skeleton width="18%" height="var(--spacing-3)" />
          {Array.from({ length: columns - 1 }, (_, index) => (
            <Skeleton
              key={index}
              width="12%"
              height="var(--spacing-3)"
              className="workspace-skeleton-cell"
            />
          ))}
        </HStack>
        {Array.from({ length: rows }, (_, row) => (
          <HStack
            key={row}
            gap={4}
            className="workspace-skeleton-row"
            vAlign="center"
          >
            <HStack gap={3} vAlign="center" className="workspace-skeleton-lead">
              <Skeleton
                width="var(--spacing-5)"
                height="var(--spacing-5)"
                index={row}
              />
              <VStack gap={1} className="workspace-skeleton-lead-text">
                <Skeleton
                  width={`${60 - (row % 3) * 12}%`}
                  height="var(--spacing-4)"
                  index={row}
                />
              </VStack>
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

/** The absolute time, local and UTC, for a tooltip and accessible name. */
export function absoluteTime(ms: number): string {
  return `${ABSOLUTE.format(ms)} local, ${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function LiveAgo({ at }: { at: number }) {
  const text = useLiveText((now) => relativeAgo(at, now), Date.now());
  return <>{text}</>;
}

/** A time as people read it: relative and live from the one shared clock,
 * with the absolute local and UTC time as its tooltip and accessible name.
 * Never a raw ISO string. */
function RelativeTimeCell({
  value,
  empty = "Not recorded",
  format = "relative",
  label,
}: {
  value: string | number | null | undefined;
  empty?: string;
  format?: "relative" | "date";
  /** What the time is, such as "Local edit", before the absolute time. */
  label?: string;
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
      aria-label={format === "date" ? undefined : absolute}
      className="workspace-time"
      suppressHydrationWarning
    >
      {format === "date" ? DATE_ONLY.format(ms) : <LiveAgo at={ms} />}
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
    previous.label === next.label,
);

/** A record's classification as a small swatch. The name is the swatch's
 * accessible name and tooltip, never visible text. */
export function TierSwatch({ tier }: { tier: string | null | undefined }) {
  if (!tier) return null;
  const name = `${tier.charAt(0).toUpperCase()}${tier.slice(1)} tier`;
  return (
    <span
      className="workspace-tier"
      data-tier={tier.toLowerCase()}
      role="img"
      aria-label={name}
      title={name}
    />
  );
}

/** The one mark for synthetic development data. */
export function SampleBadge() {
  return (
    <Token
      size="sm"
      color="orange"
      label="Sample data"
      className="workspace-sample"
      icon={<FlaskIcon weight="regular" size={14} aria-hidden="true" />}
    />
  );
}
