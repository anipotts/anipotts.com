import { Fragment, useId, useState } from "react";
import { Button } from "@openai/apps-sdk-ui/components/Button";
import { Checkbox } from "@openai/apps-sdk-ui/components/Checkbox";
import type { DataTableProps } from "./Workspace";
import {
  tableColumnStyle,
  tableFrameStyle,
  tableYieldRules,
} from "./table-layout";
import "./openai-table.css";

/** Application table composed with SDK controls. The SDK exports no table.
 * Data ordering and paging remain controlled by the owning workspace. */
export function OpenAIDataTable<T extends Record<string, unknown>>({
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
  sort,
  onSortChange,
  selectedKeys,
  onSelectionChange,
  pagination,
}: DataTableProps<T>) {
  const [foldOpen, setFoldOpen] = useState(false);
  const selection =
    selectedKeys !== undefined && onSelectionChange !== undefined;
  const scope = useId();
  const layoutColumns = selection
    ? [
        ...columns,
        { key: "__selection", header: "", width: 44, render: () => null },
      ]
    : columns;
  const frameStyle = tableFrameStyle(columns, selection ? 44 : 0);
  const yieldRules = tableYieldRules(layoutColumns, scope);
  const columnAttributes = (column: (typeof columns)[number]) => ({
    "data-column": column.key,
    "data-hide-below": column.hideBelow,
    "data-numeric": column.numeric || undefined,
    "data-align": column.numeric ? "end" : column.align,
  });
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = groupBy?.(row) ?? "";
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const groupKeys = [...groups.keys()].sort((a, b) =>
    a === foldGroup ? 1 : b === foldGroup ? -1 : 0,
  );
  const visibleRows = groupKeys.flatMap((key) =>
    key === foldGroup && !foldOpen ? [] : groups.get(key)!,
  );
  const allSelected =
    visibleRows.length > 0 &&
    visibleRows.every((row) => selectedKeys?.has(String(row[rowKey])));
  const someSelected = visibleRows.some((row) =>
    selectedKeys?.has(String(row[rowKey])),
  );
  const changeSelection = (keys: string[], selected: boolean) => {
    const next = new Set(selectedKeys);
    keys.forEach((key) => (selected ? next.add(key) : next.delete(key)));
    onSelectionChange?.(next);
  };
  const pages = pagination
    ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
    : 1;
  return (
    <div
      className="openai-table"
      data-interactive={interactive}
      data-footer={footer}
    >
      {yieldRules && <style>{yieldRules}</style>}
      {(onSortChange || selection) && (
        <div className="openai-mobile-sort" aria-label="Record controls">
          {selection && (
            <Checkbox
              label="Select visible records"
              checked={
                allSelected ? true : someSelected ? "indeterminate" : false
              }
              disabled={!visibleRows.length}
              onCheckedChange={(checked) =>
                changeSelection(
                  visibleRows.map((row) => String(row[rowKey])),
                  checked,
                )
              }
            />
          )}
          {columns
            .filter((column) => column.sortable && onSortChange)
            .map((column) => (
              <Button
                pill={false}
                key={column.key}
                color="secondary"
                variant="ghost"
                size="lg"
                aria-pressed={sort?.key === column.key}
                onClick={() =>
                  onSortChange?.({
                    key: column.key,
                    direction:
                      sort?.key === column.key && sort.direction === "asc"
                        ? "desc"
                        : "asc",
                  })
                }
              >
                {column.header}
                {sort?.key === column.key
                  ? sort.direction === "asc"
                    ? " ↑"
                    : " ↓"
                  : ""}
              </Button>
            ))}
        </div>
      )}
      <div
        className="openai-table-frame"
        style={frameStyle}
        data-yield-scope={scope}
      >
        <table role="table" aria-label={label} className="openai-record-table">
          <thead role="rowgroup">
            <tr role="row">
              {selection && (
                <th
                  role="columnheader"
                  scope="col"
                  className="openai-table-select"
                >
                  <Checkbox
                    label={
                      <span className="sr-only">Select visible records</span>
                    }
                    checked={
                      allSelected
                        ? true
                        : someSelected
                          ? "indeterminate"
                          : false
                    }
                    disabled={!visibleRows.length}
                    onCheckedChange={(checked) =>
                      changeSelection(
                        visibleRows.map((row) => String(row[rowKey])),
                        checked,
                      )
                    }
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  role="columnheader"
                  key={column.key}
                  scope="col"
                  {...columnAttributes(column)}
                  style={tableColumnStyle(column, columns)}
                  aria-sort={
                    sort?.key === column.key
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {column.sortable && onSortChange && (
                    <span className="openai-mobile-column-name">
                      {column.header}
                    </span>
                  )}
                  {column.sortable && onSortChange ? (
                    <Button
                      pill={false}
                      color="secondary"
                      variant="ghost"
                      size="lg"
                      onClick={() =>
                        onSortChange({
                          key: column.key,
                          direction:
                            sort?.key === column.key && sort.direction === "asc"
                              ? "desc"
                              : "asc",
                        })
                      }
                    >
                      {column.header}
                      {sort?.key === column.key
                        ? sort.direction === "asc"
                          ? " ↑"
                          : " ↓"
                        : ""}
                    </Button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody role="rowgroup">
            {groupKeys.map((key) => (
              <Fragment key={key}>
                {groupBy && (
                  <tr role="row" className="openai-group-row">
                    <th
                      scope="rowgroup"
                      colSpan={columns.length + Number(selection)}
                    >
                      {key === foldGroup ? (
                        <Button
                          pill={false}
                          color="secondary"
                          variant="ghost"
                          size="lg"
                          aria-expanded={foldOpen}
                          onClick={() => setFoldOpen(!foldOpen)}
                        >
                          {groupLabel(key)} (
                          {foldCount ?? groups.get(key)!.length})
                        </Button>
                      ) : (
                        groupLabel(key)
                      )}
                    </th>
                  </tr>
                )}
                {(key === foldGroup && !foldOpen ? [] : groups.get(key)!).map(
                  (row) => (
                    <tr
                      role="row"
                      key={String(row[rowKey])}
                      data-record-id={String(row[rowKey])}
                      data-selected={
                        selectedKeys?.has(String(row[rowKey])) || undefined
                      }
                    >
                      {selection && (
                        <td role="cell" className="openai-table-select">
                          <Checkbox
                            label={
                              <span className="sr-only">
                                Select record {String(row.title ?? row[rowKey])}
                              </span>
                            }
                            checked={selectedKeys.has(String(row[rowKey]))}
                            onCheckedChange={(checked) =>
                              changeSelection([String(row[rowKey])], checked)
                            }
                          />
                        </td>
                      )}
                      {columns.map((column, index) => (
                        <td
                          role="cell"
                          key={column.key}
                          {...columnAttributes(column)}
                          data-lead={index === 0 || undefined}
                        >
                          {index > 0 && (
                            <span
                              className="openai-mobile-label"
                              aria-hidden="true"
                            >
                              {column.header}
                            </span>
                          )}
                          {index === 0 ? (
                            column.render(row)
                          ) : (
                            <span className="workspace-cell">
                              {column.render(row)}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ),
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {footer && (
        <div className="openai-table-footer">
          <span role="status">
            {rows.length} {rows.length === 1 ? noun[0] : noun[1]} in view
            {pagination ? ` of ${pagination.total}` : ""}
          </span>
          {figures
            ?.filter(([, value]) => value > 0)
            .map(([name, value]) => (
              <span key={name}>
                {value} {name}
              </span>
            ))}
          {selection && <span>{selectedKeys.size} selected</span>}
        </div>
      )}
      {pagination && (
        <nav className="openai-pagination" aria-label={`${label} pages`}>
          <Button
            pill={false}
            color="secondary"
            variant="outline"
            size="lg"
            disabled={pagination.page <= 0}
            onClick={() => pagination.onPageChange(pagination.page - 1)}
          >
            Previous
          </Button>
          <span>
            Page {pagination.page + 1} of {pages}
          </span>
          <Button
            pill={false}
            color="secondary"
            variant="outline"
            size="lg"
            disabled={pagination.page + 1 >= pages}
            onClick={() => pagination.onPageChange(pagination.page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
