// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataTable, type Column } from "./Workspace";
import { OpenAIDataTable } from "./OpenAIDataTable";
import {
  columnsAt,
  shareWidthAt,
  tableColumnStyle,
  tableFrameStyle,
  tableYieldRules,
} from "./table-layout";

type Row = { id: string; title: string };
const rows = [{ id: "a", title: "A sufficiently long article title" }];
const columns: Column<Row>[] = [
  { key: "title", header: "Title", room: 360, render: (row) => row.title },
  {
    key: "summary",
    header: "Summary",
    share: 0.5,
    reserve: 360,
    min: 80,
    want: 220,
    hideBelow: "large",
    render: () => "Summary",
  },
  {
    key: "state",
    header: "State",
    width: 96,
    yieldOrder: 1,
    render: () => "Published",
  },
  {
    key: "updated",
    header: "Updated",
    width: 112,
    align: "end",
    numeric: true,
    render: () => "12d ago",
  },
];
const props = {
  rows,
  columns,
  rowKey: "id" as const,
  label: "Articles",
  noun: ["article", "articles"] as [string, string],
};
function host(markup: string) {
  const node = document.createElement("div");
  node.innerHTML = markup;
  return node;
}

describe("shared table geometry", () => {
  it("writes identical complete sizing on both renderers", () => {
    const legacy = host(renderToStaticMarkup(<DataTable {...props} />));
    const sdk = host(renderToStaticMarkup(<OpenAIDataTable {...props} />));
    expect(
      (sdk.querySelector(".openai-table-frame") as HTMLElement).getAttribute(
        "style",
      ),
    ).toBe(
      (
        legacy.querySelector(".workspace-table-frame") as HTMLElement
      ).getAttribute("style"),
    );
    for (const column of columns) {
      const query = `thead [data-column="${column.key}"]`;
      const actual = sdk.querySelector(query) as HTMLElement;
      const expected = legacy.querySelector(query) as HTMLElement;
      expect(actual.style.width).toBe(expected.style.width);
      expect(actual.style.minWidth).toBe(expected.style.minWidth);
      expect(actual.getAttribute("data-hide-below")).toBe(
        expected.getAttribute("data-hide-below"),
      );
      expect(
        sdk.querySelector(`tbody [data-column="${column.key}"]`),
      ).not.toBeNull();
    }
    expect(
      sdk.querySelector('[data-column="updated"]')?.getAttribute("data-align"),
    ).toBe("end");
    expect(
      sdk
        .querySelector('[data-column="updated"]')
        ?.hasAttribute("data-numeric"),
    ).toBe(true);
    expect(sdk.querySelector("style")?.textContent).toContain("@container");
  });
  it("budgets selection width before splitting the remaining space", () => {
    const markup = host(
      renderToStaticMarkup(
        <OpenAIDataTable
          {...props}
          selectedKeys={new Set()}
          onSelectionChange={() => {}}
        />,
      ),
    );
    const frame = markup.querySelector(".openai-table-frame") as HTMLElement;
    expect(frame.style.getPropertyValue("--workspace-table-fixed-wide")).toBe(
      "252px",
    );
    expect(markup.querySelectorAll("thead th")).toHaveLength(5);
    expect(frame.style.getPropertyValue("--workspace-table-min-compact")).toBe(
      "0px",
    );
  });
  it("keeps the title reserve and hides eligible columns before cutting it", () => {
    expect(shareWidthAt(columns[1], 960, 208)).toBe(376);
    expect(shareWidthAt(columns[1], 620, 208)).toBe(80);
    expect(
      columnsAt(columns, "large", 600).map((column) => column.key),
    ).toEqual(["title", "summary", "updated"]);
    expect(
      columnsAt(columns, "medium", 520).map((column) => column.key),
    ).toEqual(["title", "updated"]);
    expect(tableYieldRules(columns, "sample")).toContain('data-column="state"');
  });
  it("shares max/spread sizing and declared minimums", () => {
    const spreadColumns: Column<Row>[] = [
      { key: "title", header: "Title", max: 240, render: () => null },
      {
        key: "count",
        header: "Count",
        width: 80,
        spread: true,
        render: () => null,
      },
    ];
    expect(tableColumnStyle(spreadColumns[1], spreadColumns).width).toContain(
      "240px",
    );
    expect(
      tableColumnStyle({ ...columns[0], min: 100 }, columns).minWidth,
    ).toBe(100);
    expect(
      tableFrameStyle(spreadColumns)["--workspace-table-spread-wide" as never],
    ).toBe("1");
  });
});
