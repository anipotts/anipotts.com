// @vitest-environment jsdom
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleIcon } from "@phosphor-icons/react";
import {
  DataTable,
  FilterBar,
  RowTitle,
  SEARCH_DEBOUNCE_MS,
  StateBadge,
  StateNotice,
  TierMark,
  badgeFor,
  tableMinWidths,
  type Column,
} from "./Workspace";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Row = { id: string; title: string; at: string };
const rows: Row[] = [
  { id: "a", title: "First", at: "2026-09-21T12:00:00Z" },
  { id: "b", title: "Second", at: "2026-09-20T12:00:00Z" },
];
const columns: Column<Row>[] = [
  {
    key: "title",
    header: "Title",
    render: (row) => (
      <RowTitle
        icon={ArticleIcon}
        kind="Article"
        title={row.title}
        href={`/x/${row.id}`}
        time={row.at}
      />
    ),
  },
  { key: "summary", header: "Summary", hideBelow: "large", render: () => "" },
  {
    key: "owner",
    header: "Owner",
    width: 104,
    hideBelow: "wide",
    render: () => "",
  },
  { key: "state", header: "State", width: 132, render: () => "" },
  { key: "at", header: "Updated", width: 112, render: (row) => row.at },
];
const html = (node: React.ReactElement) => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(node);
  return host;
};

describe("DataTable", () => {
  it("counts only the columns each range shows toward the minimum width", () => {
    expect(tableMinWidths(columns)).toEqual({
      compact: 0,
      medium: 80 + 132 + 112,
      large: 80 + 80 + 132 + 112,
      wide: 80 + 80 + 104 + 132 + 112,
    });
    const host = html(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey="id"
        label="Records"
        noun={["record", "records"]}
      />,
    );
    const frame = host.querySelector<HTMLElement>(".workspace-table-frame")!;
    expect(frame.style.getPropertyValue("--workspace-table-min-medium")).toBe(
      "324px",
    );
    // Astryx gets no widths, so it never writes a minimum of its own.
    expect(host.querySelector("table")!.style.minWidth).toBe("");
    expect(host.querySelector("style")).toBeNull();
  });

  it("marks hidden columns by range and sizes the header cells itself", () => {
    const host = html(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey="id"
        label="Records"
        noun={["record", "records"]}
      />,
    );
    const headers = [...host.querySelectorAll("thead th")];
    expect(headers.map((th) => th.getAttribute("data-hide-below"))).toEqual([
      null,
      "large",
      "wide",
      null,
      null,
    ]);
    expect((headers[2] as HTMLElement).style.width).toBe("104px");
    expect((headers[0] as HTMLElement).style.width).toBe("auto");
    const cells = [...host.querySelectorAll("tbody tr")[0]!.children];
    expect(cells[1]!.getAttribute("data-hide-below")).toBe("large");
  });

  it("is a tab stop only while it overflows, and names itself then", () => {
    const host = html(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey="id"
        label="Records"
        noun={["record", "records"]}
      />,
    );
    const wrapper = host.querySelector(".astryx-table-scroll-wrapper")!;
    expect(wrapper.hasAttribute("tabindex")).toBe(false);
    expect(wrapper.hasAttribute("role")).toBe(false);
  });

  it("speaks the count in the strip under the table", () => {
    const host = html(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey="id"
        label="Records"
        noun={["record", "records"]}
        figures={[
          ["drafts", 1],
          ["hidden", 0],
        ]}
      />,
    );
    const count = host.querySelector('[role="status"]')!;
    expect(count.getAttribute("aria-label")).toBe("2 records");
    expect(host.querySelector(".workspace-table-footer")!.textContent).toBe(
      "2 records in view1 drafts",
    );
  });
});

describe("RowTitle", () => {
  it("leads with a tile, links only the title and carries phone meta", () => {
    const host = html(
      <RowTitle
        icon={ArticleIcon}
        kind="Article"
        title="A title"
        href="/x"
        secondary="source-id"
        mobile={<StateBadge domain="content" state="draft" />}
        end="3 open"
        time="2026-09-21T12:00:00Z"
      />,
    );
    const mark = host.querySelector(".workspace-row-mark")!;
    expect(mark.getAttribute("title")).toBe("Article");
    expect(mark.querySelector("svg")).not.toBeNull();
    const link = host.querySelector("a[data-row-link]")!;
    expect(link.textContent).toBe("A title");
    expect(host.querySelector(".workspace-row-end")!.textContent).toMatch(
      /^3 open/,
    );
    expect(host.querySelector(".workspace-row-end time")).not.toBeNull();
    const meta = host.querySelector(".workspace-row-meta")!;
    expect(meta.hasAttribute("data-compact-only")).toBe(false);
    expect(meta.querySelector(".workspace-row-detail")!.textContent).toBe(
      "Draft",
    );
  });

  it("takes a mark node in place of the glyph", () => {
    const host = html(
      <RowTitle
        mark={<img alt="" src="/mark.svg" className="brand" />}
        kind="GitHub"
        title="Runbook"
      />,
    );
    expect(host.querySelector(".workspace-row-mark img.brand")).not.toBeNull();
    expect(host.querySelector(".workspace-row-mark svg")).toBeNull();
  });

  it("keeps a phone-only line 2 out of wider layouts", () => {
    const host = html(
      <RowTitle
        icon={ArticleIcon}
        kind="Article"
        title="A title"
        mobile="Failing"
      />,
    );
    expect(
      host
        .querySelector(".workspace-row-meta")!
        .getAttribute("data-compact-only"),
    ).toBe("true");
  });
});

describe("StateBadge", () => {
  it("draws a chip only for a state other than the default", () => {
    for (const [domain, state] of [
      ["content", "published"],
      ["ops", "ok"],
      ["record", "observed"],
    ] as const) {
      const host = html(<StateBadge domain={domain} state={state} />);
      expect(host.querySelector(".workspace-state")).toBeNull();
      expect(host.querySelector(".sr-only")!.textContent).toBe(
        badgeFor(domain, state).label,
      );
    }
    const draft = html(<StateBadge domain="content" state="draft" />);
    expect(draft.querySelector(".workspace-state")!.textContent).toBe("Draft");
    const failing = html(<StateBadge domain="ops" state="failing" />);
    expect(
      failing.querySelector("[data-variant]")!.getAttribute("data-variant"),
    ).toBe("error");
  });

  it("reads unknown states as neutral exceptions in sentence case", () => {
    expect(badgeFor("content", "needs_review")).toEqual({
      label: "Needs review",
      tone: "neutral",
    });
    expect(badgeFor("ops", "stale").icon).toBeDefined();
  });

  it("always renders an explicit tone and label", () => {
    const host = html(<StateBadge tone="warning" label="404" />);
    expect(host.querySelector(".workspace-state")!.textContent).toBe("404");
  });
});

describe("notices and marks", () => {
  it("drops a trailing period from notice titles", () => {
    const host = html(<StateNotice kind="empty" title="No events yet." />);
    expect(host.querySelector("h2")!.textContent).toBe("No events yet");
  });

  it("shows a tier as a named glyph", () => {
    const host = html(<TierMark tier="restricted" />);
    const mark = host.querySelector('[role="img"]')!;
    expect(mark.getAttribute("aria-label")).toBe("Restricted tier");
    expect(mark.querySelector("svg")).not.toBeNull();
  });
});

describe("FilterBar", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  function mount(onChange: (value: string) => void, onClear?: () => void) {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <FilterBar
          search={{ label: "Search writing", value: "", onChange, onClear }}
        />,
      ),
    );
    return { host, root };
  }
  const type = (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!;
    act(() => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it("is one search landmark with a search keyboard", () => {
    const { host, root } = mount(() => {});
    expect(host.querySelector('form[role="search"]')).not.toBeNull();
    const input = host.querySelector("input")!;
    expect(input.getAttribute("enterkeyhint")).toBe("search");
    expect(input.getAttribute("inputmode")).toBe("search");
    expect(input.getAttribute("autocapitalize")).toBe("off");
    expect(input.getAttribute("spellcheck")).toBe("false");
    act(() => root.unmount());
  });

  it("searches once typing rests, and at once on Enter", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { host, root } = mount(onChange);
    const input = host.querySelector("input")!;
    type(input, "ga");
    type(input, "gar");
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("gar");
    type(input, "garden");
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onChange).toHaveBeenLastCalledWith("garden");
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(onChange).toHaveBeenCalledTimes(2);
    act(() => root.unmount());
  });

  it("clears at once through onClear", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const onClear = vi.fn();
    const { host, root } = mount(onChange, onClear);
    const input = host.querySelector("input")!;
    type(input, "x");
    const clear = host.querySelector<HTMLButtonElement>(
      'button[aria-label*="lear"]',
    )!;
    act(() => clear.click());
    act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
