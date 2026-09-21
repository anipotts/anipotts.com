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
import {
  Timestamp,
  type TimestampTooltipEntry,
} from "@astryxdesign/core/Timestamp";
import { Token } from "@astryxdesign/core/Token";
import { VStack } from "@astryxdesign/core/VStack";
import {
  LinkBreakIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import "./workspace.css";

/** Page title, one supporting line and the page's own actions. */
export function WorkspacePage({
  title,
  meta,
  actions,
  children,
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <VStack gap={5} className="workspace-page">
      <HStack
        gap={3}
        hAlign="between"
        vAlign="center"
        wrap="wrap"
        className="workspace-page-header"
      >
        <VStack gap={1} className="workspace-page-title">
          <Heading level={1}>{title}</Heading>
          {meta && (
            <Text type="supporting" color="secondary" role="status">
              {meta}
            </Text>
          )}
        </VStack>
        {actions && (
          <HStack gap={2} wrap="wrap" vAlign="center">
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
        {actions}
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
          hasHover
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
}: {
  icon: Icon;
  /** The row's kind, as a tooltip and for assistive technology. */
  kind: string;
  title: string;
  href?: string;
  /** Opens the row in place. With an href, a plain click opens in place and
   * a modified click (new tab) follows the link. */
  onSelect?: (trigger: HTMLElement) => void;
  isPressed?: boolean;
  controls?: string;
  secondary?: ReactNode;
  mobile?: ReactNode;
}) {
  return (
    <HStack gap={3} vAlign="center" className="editorial-record-heading">
      <span className="editorial-record-icon" title={kind}>
        <Glyph weight="regular" size={20} aria-hidden="true" />
        <Text className="sr-only">{kind}</Text>
      </span>
      <VStack gap={0} className="editorial-record-content">
        {href || onSelect ? (
          <Button
            size="sm"
            label={title}
            href={href}
            onClick={
              onSelect
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
                : undefined
            }
            aria-current={onSelect && isPressed ? "true" : undefined}
            aria-controls={controls}
            variant="ghost"
            className="record-link"
          />
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
            gap={3}
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
  description,
  action,
  icon: Glyph = NOTICE_ICONS[kind],
  headingLevel,
}: {
  kind: NoticeKind;
  title: string;
  description?: string;
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
        {description && (
          <Text type="supporting" color="secondary" as="p">
            {description}
          </Text>
        )}
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
  description,
  action,
  icon: Glyph = WarningCircleIcon,
}: {
  tone: "info" | "warning" | "error";
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: Icon;
}) {
  return (
    <Banner
      status={tone}
      container="section"
      title={title}
      description={description}
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

const TIME_TOOLTIP: ReadonlyArray<TimestampTooltipEntry> = [
  { label: "Local", timezoneID: "local", format: "full" },
  { label: "UTC", timezoneID: "UTC", format: "full" },
];

/** A time as people read it: relative, with the absolute local and UTC time
 * on hover and focus. Never a raw ISO string. */
function RelativeTimeCell({
  value,
  empty = "Not recorded",
  format = "relative_short",
}: {
  value: string | null | undefined;
  empty?: string;
  format?: "relative_short" | "date_time" | "date";
}) {
  if (!value || !Number.isFinite(Date.parse(value)))
    return (
      <Text color="secondary" className="workspace-time">
        {empty}
      </Text>
    );
  return (
    <span className="workspace-time">
      <Timestamp
        value={value}
        format={format}
        isLive={format === "relative_short"}
        tooltipEntries={TIME_TOOLTIP}
      />
    </span>
  );
}

/** Skips renders while the value is unchanged; Timestamp keeps its own
 * live clock, so relative text still advances. */
export const RelativeTime = memo(
  RelativeTimeCell,
  (previous, next) =>
    previous.value === next.value &&
    previous.empty === next.empty &&
    previous.format === next.format,
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

/** The inline control for a workspace that needs a private session. */
export function SessionControl({
  active,
  opening,
  onOpen,
  onEnd,
  note,
}: {
  active: boolean;
  opening?: boolean;
  onOpen: () => void | Promise<void>;
  onEnd: () => void;
  note?: string;
}) {
  return active ? (
    <Button label="End session" size="sm" variant="secondary" onClick={onEnd} />
  ) : (
    <HStack gap={2} vAlign="center" wrap="wrap">
      {note && (
        <Text type="supporting" color="secondary">
          {note}
        </Text>
      )}
      <Button
        label="Open private session"
        size="sm"
        variant="primary"
        clickAction={onOpen}
        isLoading={opening}
      />
    </HStack>
  );
}
