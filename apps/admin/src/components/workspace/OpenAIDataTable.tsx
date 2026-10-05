import { Fragment, useEffect, useId, useState } from "react";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { CaretRightIcon } from "@phosphor-icons/react";
import type { DataTableProps } from "./Workspace";
import {
  tableColumnStyle,
  tableFrameStyle,
  tableFitRules,
} from "./table-layout";
import "./openai-table.css";

export function groupTableRows<T>(
  rows: readonly T[],
  groupBy?: (row: T) => string,
  foldGroup?: string,
) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupBy?.(row) ?? "";
    const members = groups.get(key);
    if (members) members.push(row);
    else groups.set(key, [row]);
  }
  if (foldGroup !== undefined && groups.has(foldGroup)) {
    const last = groups.get(foldGroup)!;
    groups.delete(foldGroup);
    groups.set(foldGroup, last);
  }
  return groups;
}
export function tableCountText(
  loaded: number,
  total?: number,
  filtered?: number,
  noun: readonly [string, string] = ["record", "records"],
) {
  if (filtered !== undefined)
    return loaded === filtered
      ? `${filtered} matching${total !== undefined ? ` of ${total}` : ""}`
      : `${loaded} loaded, ${filtered} matching${total !== undefined ? ` of ${total}` : ""}`;
  if (total === loaded) return `${loaded} ${loaded === 1 ? noun[0] : noun[1]}`;
  return `${loaded} loaded${total !== undefined ? ` of ${total} total` : ""}`;
}

/** One admin-owned semantic renderer. No SDK reset or provider is installed here. */
export function OpenAIDataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  rowKey,
  label,
  tableId = label,
  noun,
  interactive = true,
  groupBy,
  groupLabel = (key) => key,
  foldGroup,
  foldCount,
  sort,
  onSortChange,
  selectedKeys,
  onSelectionChange,
  pagination,
  renderExpanded,
  groupCounts,
  groupTotals,
  loading = false,
  loadingRows = 6,
  error,
  onRetry,
  emptyMessage,
  searchActive = false,
}: DataTableProps<T>) {
  const scope = useId();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const storageKey = `admin:table-groups:v1:${tableId}`;
  useEffect(() => {
    if (!groupBy) {
      setCollapsed({});
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
      setCollapsed(
        saved && typeof saved === "object" && !Array.isArray(saved)
          ? saved
          : {},
      );
    } catch {
      setCollapsed({});
    }
  }, [storageKey, Boolean(groupBy)]);
  const selection =
    selectedKeys !== undefined && onSelectionChange !== undefined;
  const groups = groupTableRows(rows, groupBy, foldGroup);
  const isCollapsed = (key: string) =>
    typeof collapsed[key] === "boolean" && Object.hasOwn(collapsed, key)
      ? collapsed[key]
      : key === foldGroup;
  const visibleRows = [...groups].flatMap(([key, members]) =>
    groupBy && isCollapsed(key) ? [] : members,
  );
  const allSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => selectedKeys?.has(String(row[rowKey])));
  const someSelected = visibleRows.some((row) =>
    selectedKeys?.has(String(row[rowKey])),
  );
  const changeSelection = (keys: string[], checked: boolean) => {
    const next = new Set(selectedKeys);
    keys.forEach((key) => (checked ? next.add(key) : next.delete(key)));
    onSelectionChange?.(next);
  };
  const toggle = (key: string) => {
    const next = { ...collapsed, [key]: !isCollapsed(key) };
    setCollapsed(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* Storage restrictions must not disable controls. */
    }
  };
  const sortColumn = (key: string) =>
    onSortChange?.({
      key,
      direction: sort?.key === key && sort.direction === "asc" ? "desc" : "asc",
    });
  const checkbox = (record?: T) => (
    <label className="admin-table-selection">
      <input
        type="checkbox"
        aria-label={
          record
            ? `Select record ${String(record.title ?? record[rowKey])}`
            : "Select visible records"
        }
        checked={
          record
            ? (selectedKeys?.has(String(record[rowKey])) ?? false)
            : allSelected
        }
        ref={(node) => {
          if (node && !record)
            node.indeterminate = !allSelected && someSelected;
        }}
        disabled={!record && !visibleRows.length}
        onChange={(event) =>
          changeSelection(
            record
              ? [String(record[rowKey])]
              : visibleRows.map((row) => String(row[rowKey])),
            event.target.checked,
          )
        }
      />
    </label>
  );
  const pages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    : 1;
  const cellAttributes = (column: (typeof columns)[number]) => ({
    "data-column": column.key,
    "data-compact": column.compact ?? "inline",
    "data-hide-below": column.hideBelow,
    "data-numeric": column.numeric || undefined,
    "data-align": column.numeric ? "end" : column.align,
  });
  return (
    <div
      className="admin-data-table openai-table"
      data-interactive={interactive}
      data-table-id={tableId}
      data-responsive="fit"
    >
      <style>{tableFitRules(columns, scope, selection ? 44 : 0)}</style>
      {selection && selectedKeys.size > 0 && (
        <div className="admin-table-controls" role="status">
          {selectedKeys.size} selected
        </div>
      )}
      {pagination && (
        <nav className="openai-pagination" aria-label={`${label} pages`}>
          <button
            type="button"
            disabled={pagination.page <= 0 || loading}
            onClick={() => pagination.onPageChange(pagination.page - 1)}
          >
            Previous
          </button>
          <span>
            Page {pagination.page + 1} of {pages}
          </span>
          <button
            type="button"
            disabled={pagination.page + 1 >= pages || loading}
            onClick={() => pagination.onPageChange(pagination.page + 1)}
          >
            Next
          </button>
        </nav>
      )}
      <div
        data-table-scope={scope}
        className="openai-table-frame workspace-table-frame"
        style={tableFrameStyle(columns, selection ? 44 : 0)}
      >
        <div className="admin-table-scroll astryx-table-scroll-wrapper">
          <table
            className="openai-record-table"
            role="table"
            aria-label={label}
            aria-busy={loading}
          >
            <thead role="rowgroup">
              <tr role="row">
                {selection && (
                  <th scope="col" className="admin-table-select">
                    {checkbox()}
                  </th>
                )}
                {columns.map((column) => (
                  <th
                    role="columnheader"
                    scope="col"
                    key={column.key}
                    {...cellAttributes(column)}
                    style={tableColumnStyle(column, columns)}
                    aria-sort={
                      sort?.key === column.key
                        ? sort.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                  >
                    {column.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => sortColumn(column.key)}
                      >
                        {column.header}
                        {sort?.key === column.key
                          ? sort.direction === "asc"
                            ? " ↑"
                            : " ↓"
                          : ""}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            {loading && !rows.length && (
              <tbody aria-hidden="true" data-loading-rows="">
                {Array.from({ length: Math.max(0, loadingRows) }, (_, row) => (
                  <tr
                    key={row}
                    data-record-id={`loading-${row}`}
                    data-loading-row=""
                  >
                    {selection && <td className="admin-table-select" />}
                    {columns.map((column, index) => (
                      <td
                        key={column.key}
                        {...cellAttributes(column)}
                        data-lead={index === 0 || undefined}
                        style={{
                          order:
                            index === 0
                              ? -1
                              : column.compact === "trailing"
                                ? 0
                                : 2 + (column.priority ?? index),
                        }}
                      >
                        {index > 0 && column.compactLabel !== false && (
                          <span
                            className="openai-mobile-label"
                            aria-hidden="true"
                          >
                            {column.header}
                          </span>
                        )}
                        <span
                          className={
                            index === 0
                              ? "admin-table-loading-primary"
                              : "admin-table-value"
                          }
                        >
                          {index === 0 && (
                            <Skeleton
                              width="var(--spacing-5)"
                              height="var(--spacing-5)"
                              radius={1}
                              index={row}
                            />
                          )}
                          <Skeleton
                            width={
                              index === 0
                                ? `${60 - (row % 3) * 12}%`
                                : "var(--spacing-12)"
                            }
                            height="var(--spacing-4)"
                            index={row}
                          />
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            )}
            {[...groups].map(([key, members]) => {
              const groupId = `${scope}-group-${encodeURIComponent(key)}`;
              const groupCount =
                groupCounts?.[key] ??
                (key === foldGroup ? foldCount : undefined) ??
                members.length;
              return (
                <tbody role="rowgroup" key={key} id={`${groupId}-records`}>
                  {groupBy && (
                    <tr
                      role="row"
                      className="openai-group-row"
                      data-group-row=""
                    >
                      <th
                        scope="rowgroup"
                        colSpan={columns.length + Number(selection)}
                      >
                        <button
                          type="button"
                          className="workspace-group-toggle admin-table-group-toggle"
                          aria-expanded={!isCollapsed(key)}
                          aria-controls={`${groupId}-records`}
                          onClick={() => toggle(key)}
                        >
                          <CaretRightIcon aria-hidden="true" />
                          <span>{groupLabel(key)}</span>
                          <span
                            className="admin-table-count"
                            aria-label={`${groupCount} loaded ${noun[1]}${groupTotals?.[key] !== undefined ? ` of ${groupTotals[key]} total` : ""}`}
                          >
                            {groupCount}
                            {groupTotals?.[key] !== undefined &&
                            groupTotals[key] !== groupCount
                              ? ` / ${groupTotals[key]}`
                              : ""}
                          </span>
                        </button>
                      </th>
                    </tr>
                  )}
                  <Fragment>
                    {(!groupBy || !isCollapsed(key)) &&
                      members.map((row) => {
                        const expanded = renderExpanded?.(row);
                        return (
                          <Fragment key={String(row[rowKey])}>
                            <tr
                              role="row"
                              key={String(row[rowKey])}
                              data-record-id={String(row[rowKey])}
                              data-selected={
                                selectedKeys?.has(String(row[rowKey])) ||
                                undefined
                              }
                            >
                              {selection && (
                                <td role="cell" className="admin-table-select">
                                  {checkbox(row)}
                                </td>
                              )}
                              {columns.map((column, index) => (
                                <td
                                  role="cell"
                                  key={column.key}
                                  {...cellAttributes(column)}
                                  data-lead={index === 0 || undefined}
                                  style={{
                                    order:
                                      index === 0
                                        ? -1
                                        : column.compact === "trailing"
                                          ? 0
                                          : 2 + (column.priority ?? index),
                                  }}
                                >
                                  {index > 0 &&
                                    column.compactLabel !== false && (
                                      <span
                                        className="openai-mobile-label"
                                        aria-hidden="true"
                                      >
                                        {column.header}
                                      </span>
                                    )}
                                  <span
                                    className={
                                      index === 0
                                        ? "admin-table-primary"
                                        : "admin-table-value"
                                    }
                                  >
                                    {column.render(row)}
                                  </span>
                                </td>
                              ))}
                            </tr>
                            {expanded && (
                              <tr className="admin-table-expanded">
                                <td
                                  colSpan={columns.length + Number(selection)}
                                >
                                  {expanded}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                  </Fragment>
                </tbody>
              );
            })}
          </table>
        </div>
        {loading ? (
          <div
            className="sr-only"
            role="status"
            aria-label={`Loading ${label.toLowerCase()}`}
          >
            Loading {noun[1]}…
          </div>
        ) : error ? (
          <div className="admin-table-state" role="alert">
            {error}
            {onRetry && (
              <button type="button" onClick={onRetry}>
                Retry
              </button>
            )}
          </div>
        ) : (
          rows.length === 0 && (
            <div className="admin-table-state" role="status">
              {emptyMessage ??
                (searchActive
                  ? "No matching records. Try changing your search or filters."
                  : `No ${noun[1]} yet.`)}
            </div>
          )
        )}
      </div>
    </div>
  );
}
