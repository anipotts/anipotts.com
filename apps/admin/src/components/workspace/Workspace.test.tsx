// @vitest-environment jsdom
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleIcon } from "@phosphor-icons/react";
import { BrandTile } from "../BrandTile";
import { opsNaming } from "../../lib/naming";
import { clockText, dayKey } from "./format";
import {
  CELL_WIDTHS,
  CompactTimeline,
  CopyValue,
  DataTable,
  DayHeader,
  DayLabel,
  DefinitionList,
  DetailText,
  DueTime,
  Duration,
  Figure,
  FilterBar,
  RelativeTime,
  RowTitle,
  SEARCH_DEBOUNCE_MS,
  StateBadge,
  StateCell,
  StateNotice,
  StateTransition,
  TechnicalSection,
  TierMark,
  TitleText,
  ValueChips,
  WorkspacePage,
  badgeFor,
  easternClockText,
  easternClockTitle,
  leadWidth,
  tableMinWidths,
  titleWidth,
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

describe("the page title line", () => {
  it("tells Eastern time to the second, with its date and UTC offset", () => {
    const summer = Date.parse("2026-09-22T19:55:12Z");
    expect(easternClockText(summer)).toBe("3:55:12 PM ET");
    expect(easternClockTitle(summer)).toBe(
      "Tuesday, September 22, 2026, UTC-04:00",
    );
    const winter = Date.parse("2026-01-05T04:03:09Z");
    expect(easternClockText(winter)).toBe("11:03:09 PM ET");
    expect(easternClockTitle(winter)).toBe(
      "Sunday, January 4, 2026, UTC-05:00",
    );
  });

  it("puts the clock and the actions on the title line, the meta below", () => {
    const at = Date.parse("2026-09-22T19:55:12Z");
    const markup = renderToStaticMarkup(
      <WorkspacePage
        title="Records"
        count={3}
        meta="Live"
        clock={at}
        actions={<button type="button">Lock</button>}
      />,
    );
    const host = document.createElement("div");
    host.innerHTML = markup;
    const line = host.querySelector(".workspace-page-line")!;
    expect(line.querySelector("h1")?.textContent).toBe("Records");
    expect(line.querySelector(".workspace-clock")?.textContent).toBe(
      "3:55:12 PM ET",
    );
    expect(line.querySelector(".workspace-clock")?.getAttribute("title")).toBe(
      "Tuesday, September 22, 2026, UTC-04:00",
    );
    expect(line.querySelector("button")?.textContent).toBe("Lock");
    // The clock ends the line on every page, after any actions, so its
    // right edge never moves between pages.
    const end = line.querySelector(".workspace-page-end")!;
    expect(end.lastElementChild?.className).toBe("workspace-clock");
    expect(line.querySelector(".workspace-page-meta")).toBeNull();
    expect(host.querySelector(".workspace-page-meta")?.textContent).toBe(
      "Live",
    );
  });
});

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

describe("DataTable groups", () => {
  it("heads each run of rows with one group row in the lead column", () => {
    const grouped = [
      { id: "a", title: "First", at: "", group: "Personal context" },
      { id: "b", title: "Second", at: "", group: "Personal context" },
      { id: "c", title: "Third", at: "", group: "Backups" },
    ];
    const host = html(
      <DataTable
        rows={grouped}
        columns={columns as unknown as Column<(typeof grouped)[number]>[]}
        rowKey="id"
        label="Grouped"
        noun={["row", "rows"]}
        groupBy={(row) => row.group}
        groupLabel={(key) => key.toUpperCase()}
      />,
    );
    expect(host.querySelectorAll("table")).toHaveLength(1);
    const body = [...host.querySelectorAll("tbody tr")];
    expect(body.map((row) => row.hasAttribute("data-group-row"))).toEqual([
      true,
      false,
      false,
      true,
      false,
    ]);
    const heading = body[0]!.querySelector("th")!;
    expect(heading.getAttribute("scope")).toBe("rowgroup");
    // One cell: a span would count hidden columns and take their width.
    expect(heading.hasAttribute("colspan")).toBe(false);
    expect(body[0]!.children).toHaveLength(1);
    expect(body[3]!.textContent).toBe("BACKUPS");
    // Group rows are not records: the count strip counts rows only.
    expect(host.querySelector(".workspace-table-count")?.textContent).toBe(
      "3 rows in view",
    );
  });
  it("gathers a group's rows under one heading when they arrive apart", () => {
    const apart = [
      { id: "a", title: "First", at: "", group: "Personal context" },
      { id: "b", title: "Second", at: "", group: "Services" },
      { id: "c", title: "Third", at: "", group: "Personal context" },
    ];
    const host = html(
      <DataTable
        rows={apart}
        columns={columns as unknown as Column<(typeof apart)[number]>[]}
        rowKey="id"
        label="Apart"
        noun={["row", "rows"]}
        groupBy={(row) => row.group}
      />,
    );
    expect(
      [...host.querySelectorAll("tbody tr")].map((row) =>
        row.hasAttribute("data-group-row")
          ? `# ${row.textContent}`
          : row.querySelector(".workspace-row-title")!.textContent,
      ),
    ).toEqual(["# Personal context", "First", "Third", "# Services", "Second"]);
  });
});

describe("RelativeTime", () => {
  const at = "2026-09-21T17:45:00Z";
  it("reads a fixed clock without ticking, and clock times on request", () => {
    const fixed = html(
      <RelativeTime value={at} now={Date.parse("2026-09-21T18:00:00Z")} />,
    );
    expect(fixed.textContent).toBe("15m ago");
    const clock = html(<RelativeTime value={at} format="time" />);
    expect(clock.textContent).toMatch(/^\d{1,2}:45\s?[AP]M$/);
    expect(clock.querySelector("time")?.getAttribute("title")).toContain("UTC");
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

/** A Status table built the one way: the lead cell with app and device
 * tiles, a never-empty state, a short detail, the last success, the next
 * run and the last duration, each at its standard width. */
describe("the table convention", () => {
  const NOW = Date.parse("2026-09-22T18:01:39Z");
  type Status = {
    id: string;
    name: string;
    kind: string;
    host: string;
    state: string;
    detail: string;
    success: string | null;
    next: string | null;
    duration: number | null;
    group: string;
  };
  const status: Status[] = [
    {
      id: "pc.writer",
      name: "personal context writer",
      kind: "job",
      host: "ap-mini",
      state: "ok",
      detail: "last pass completed",
      success: "2026-09-22T17:46:17Z",
      next: "2026-09-22T18:46:17Z",
      duration: 83.9,
      group: "Personal context",
    },
    {
      id: "content.d1-export",
      name: "content database export",
      kind: "backup",
      host: "ap-mini",
      state: "failing",
      detail: "keepalive export_failed",
      success: null,
      next: "2026-09-22T17:30:00Z",
      duration: null,
      group: "Backups",
    },
    {
      id: "pro.whatsapp",
      name: "whatsapp sync",
      kind: "job",
      host: "ap-pro",
      state: "asleep",
      detail: "host asleep",
      success: "2026-09-22T17:37:26Z",
      next: null,
      duration: null,
      group: "Personal context",
    },
    {
      id: "health.ingest",
      name: "health data received",
      kind: "job",
      host: "ap-mini",
      state: "unknown",
      detail: "no observation",
      success: null,
      next: null,
      duration: null,
      group: "Health ingest",
    },
  ];
  const statusColumns: Column<Status>[] = [
    {
      key: "name",
      header: "Name",
      render: (row) => {
        const naming = opsNaming(row);
        return (
          <RowTitle
            mark={<BrandTile id={naming.tile.id} kind={naming.tile.kind} />}
            kind={naming.tooltip}
            title={naming.name}
            tooltip={naming.tooltip}
            end={
              naming.device && (
                <BrandTile id={naming.device.id} kind="device" size={20} />
              )
            }
          />
        );
      },
    },
    {
      key: "state",
      header: "State",
      width: CELL_WIDTHS.state,
      render: (row) => <StateCell domain="ops" state={row.state} />,
    },
    {
      key: "detail",
      header: "Detail",
      hideBelow: "large",
      render: (row) => <DetailText>{row.detail}</DetailText>,
    },
    {
      key: "success",
      header: "Last success",
      width: CELL_WIDTHS.time,
      render: (row) => <RelativeTime value={row.success} now={NOW} />,
    },
    {
      key: "next",
      header: "Next due",
      width: CELL_WIDTHS.time,
      render: (row) => <DueTime value={row.next} now={NOW} />,
    },
    {
      key: "duration",
      header: "Duration",
      width: CELL_WIDTHS.figure,
      numeric: true,
      render: (row) => <Duration seconds={row.duration} />,
    },
  ];

  it("fills every state cell, lines figures up at the end and truncates details", () => {
    const host = html(
      <DataTable
        rows={status}
        columns={statusColumns}
        rowKey="id"
        label="Status"
        noun={["entry", "entries"]}
        groupBy={(row) => row.group}
      />,
    );
    const body = [...host.querySelectorAll("tbody tr:not([data-group-row])")];
    const byId = (id: string) =>
      body.find((row) => row.querySelector(`[title="${id}"]`))!;
    const cells = (id: string) => [...byId(id).children];
    // The lead reads the short name with its app and device tiles.
    expect(cells("pc.writer")[0]!.textContent).toContain(
      "Personal context writer",
    );
    expect(
      cells("pro.whatsapp")[0]!.querySelector('[data-mark="ap-pro"]'),
    ).not.toBeNull();
    expect(
      cells("pro.whatsapp")[0]!.querySelector('[data-mark="whatsapp"]'),
    ).not.toBeNull();
    // OK is a quiet dot, never an empty cell; the others are chips.
    const ok = cells("pc.writer")[1]!;
    expect(ok.querySelector(".workspace-state")).toBeNull();
    expect(
      ok.querySelector(".workspace-state-quiet")!.getAttribute("aria-label"),
    ).toBe("OK");
    expect(ok.querySelector('[data-variant="success"]')).not.toBeNull();
    const tones = ["content.d1-export", "pro.whatsapp", "health.ingest"].map(
      (id) =>
        cells(id)[1]!.querySelector("[data-tone]")!.getAttribute("data-tone"),
    );
    expect(tones).toEqual(["critical", "rest", "neutral"]);
    expect(cells("health.ingest")[1]!.textContent).toBe("Unknown");
    // Details truncate with their full text on hover.
    const detail = cells("content.d1-export")[2]!.querySelector(
      ".workspace-detail-text",
    )!;
    expect(detail.getAttribute("title")).toBe("keepalive export_failed");
    // Next due counts down, and overdue reads as overdue.
    expect(cells("pc.writer")[4]!.textContent).toBe("in 44m");
    expect(
      cells("content.d1-export")[4]!.querySelector('[data-overdue="true"]')
        ?.textContent,
    ).toBe("31m overdue");
    // Durations are figures: right-aligned, header included.
    expect(cells("pc.writer")[5]!.textContent).toBe("1m 24s");
    expect(cells("pc.writer")[5]!.hasAttribute("data-numeric")).toBe(true);
    const header = [...host.querySelectorAll("thead th")].at(-1)!;
    expect(header.hasAttribute("data-numeric")).toBe(true);
    // Two flexible columns share the width the fixed ones leave.
    const widths = [...host.querySelectorAll("thead th")].map(
      (th) => (th as HTMLElement).style.width,
    );
    expect(widths).toEqual(["auto", "144px", "auto", "116px", "116px", "80px"]);
  });
});

describe("a name that never truncates", () => {
  it("keeps room for the longest title, the detail giving way first", () => {
    type Row = { id: string; name: string; detail: string };
    const rows: Row[] = [
      {
        id: "a",
        name: "Session transcripts to R2, ap-mini",
        detail: "healthy",
      },
      { id: "b", name: "Sync", detail: "last run ok" },
    ];
    const room = leadWidth(rows.map((row) => row.name));
    // Instrument Sans draws the longest title at about 219px; the lead's
    // inset, tile and gaps add 64, and the estimate errs wide.
    expect(room).toBeGreaterThanOrEqual(64 + 219);
    expect(room).toBeLessThan(64 + 219 + 16);
    const host = html(
      <DataTable
        rows={rows}
        rowKey="id"
        label="Entries"
        noun={["entry", "entries"]}
        columns={[
          {
            key: "name",
            header: "Service",
            render: (row) => <RowTitle kind="Job" title={row.name} />,
          },
          { key: "state", header: "State", width: 116, render: () => null },
          {
            key: "detail",
            header: "Detail",
            share: 0.5,
            reserve: room,
            render: (row) => <DetailText>{row.detail}</DetailText>,
          },
        ]}
      />,
    );
    const [lead, state, detail] = [
      ...host.querySelectorAll("thead th"),
    ] as HTMLElement[];
    expect(lead!.style.width).toBe("auto");
    expect(state!.style.width).toBe("116px");
    // Half of what the fixed columns leave, but never the lead's room.
    expect(detail!.style.width).toContain(`- ${room}px`);
    expect(detail!.style.width).toContain("* 0.5");
    expect(detail!.style.minWidth).toBe(detail!.style.width);
    // Every cell names its column for page rules.
    expect(detail!.getAttribute("data-column")).toBe("detail");
  });

  it("keeps a floor under a shared column whose cells must stay whole", () => {
    const columns: Column<{ id: string }>[] = [
      { key: "name", header: "Event", render: () => null },
      {
        key: "change",
        header: "Change",
        share: 0.5,
        reserve: 290,
        min: 256,
        render: () => null,
      },
      { key: "at", header: "When", width: 116, render: () => null },
    ];
    const host = html(
      <DataTable
        rows={[{ id: "a" }]}
        rowKey="id"
        label="Events"
        noun={["event", "events"]}
        columns={columns}
      />,
    );
    const change = host.querySelectorAll("thead th")[1] as HTMLElement;
    expect(change.style.width.startsWith("max(256px,")).toBe(true);
    // The floor counts toward the table's minimum, so the table scrolls
    // before it would cut the chips.
    expect(tableMinWidths(columns).wide).toBe(80 + 256 + 116);
  });

  it("clamps the room between its bounds and counts wide glyphs wider", () => {
    expect(leadWidth(["OK"])).toBe(160);
    expect(leadWidth(["x".repeat(200)])).toBe(360);
    expect(titleWidth("mmmm")).toBeGreaterThan(titleWidth("iiii") * 3);
    // Anything outside printable ASCII counts as wide.
    expect(titleWidth("é")).toBeGreaterThanOrEqual(10);
  });

  it("keeps a host suffix whole while the base gives way", () => {
    const host = html(
      <TitleText title="Session transcripts to R2, ap-mini" keep=", ap-mini" />,
    );
    const title = host.querySelector(".workspace-row-title")!;
    expect(title.hasAttribute("data-keep")).toBe(true);
    expect(title.querySelector(".workspace-title-base")?.textContent).toBe(
      "Session transcripts to R2",
    );
    expect(title.querySelector(".workspace-title-keep")?.textContent).toBe(
      ", ap-mini",
    );
    expect(title.textContent).toBe("Session transcripts to R2, ap-mini");
    // A suffix the title does not end with, or no suffix, is one span.
    for (const keep of [", ap-pro", undefined]) {
      const plain = html(<TitleText title="Sync" keep={keep} />);
      expect(plain.querySelector("[data-keep]")).toBeNull();
      expect(plain.textContent).toBe("Sync");
    }
  });
});

describe("folded group", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });
  type Source = { id: string; group: string };
  const sources: Source[] = [
    { id: "zero-a", group: "Discovered, not connected" },
    { id: "live-a", group: "Live" },
    { id: "zero-b", group: "Discovered, not connected" },
    { id: "live-b", group: "Live" },
  ];
  const sourceColumns: Column<Source>[] = [
    {
      key: "id",
      header: "Source",
      render: (row) => <RowTitle kind="Source" title={row.id} />,
    },
  ];

  it("sits last, folded, with its count, and opens from its heading", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <DataTable
          rows={sources}
          columns={sourceColumns}
          rowKey="id"
          label="Sources"
          noun={["source", "source"]}
          groupBy={(row) => row.group}
          foldGroup="Discovered, not connected"
        />,
      ),
    );
    const titles = () =>
      [...host.querySelectorAll("tbody tr")].map((row) => row.textContent);
    expect(titles()).toEqual([
      "Live",
      "live-a",
      "live-b",
      "Discovered, not connected2",
    ]);
    const toggle = host.querySelector<HTMLButtonElement>(
      ".workspace-group-toggle",
    )!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    act(() => toggle.click());
    expect(titles()).toEqual([
      "Live",
      "live-a",
      "live-b",
      "Discovered, not connected2",
      "zero-a",
      "zero-b",
    ]);
    expect(
      host
        .querySelector(".workspace-group-toggle")!
        .getAttribute("aria-expanded"),
    ).toBe("true");
    act(() => root.unmount());
  });
});

describe("cells", () => {
  const NOW = Date.parse("2026-09-22T18:00:00Z");
  it("shows transitions as two chips, and a first sighting as one", () => {
    const change = html(
      <StateTransition domain="ops" from="ok" to="failing" />,
    );
    expect(
      [...change.querySelectorAll(".workspace-state")].map(
        (chip) => chip.textContent,
      ),
    ).toEqual(["OK", "Failing"]);
    expect(change.querySelector(".workspace-transition-mark")).not.toBeNull();
    expect(change.textContent).toBe("OKtoFailing");
    const first = html(<StateTransition domain="ops" from={null} to="ok" />);
    expect(first.querySelectorAll(".workspace-state")).toHaveLength(1);
    expect(first.textContent).toBe("First seenOK");
  });

  it("formats figures and leaves missing ones quiet", () => {
    expect(
      html(<Figure value={1204} noun={["visit", "visits"]} />).textContent,
    ).toBe("1,204 visits");
    expect(html(<Figure value={null} />).textContent).toBe("Not recorded");
    expect(
      html(<Figure value={null} />).querySelector(".sr-only"),
    ).not.toBeNull();
    expect(html(<Duration ms={84} />).textContent).toBe("84ms");
    expect(html(<Duration seconds={null} empty="None" />).textContent).toBe(
      "None",
    );
    expect(
      html(<DueTime value="2026-09-22T17:59:30Z" now={NOW} />).textContent,
    ).toBe("due now");
  });

  it("heads day groups live, and as a heading outside tables", () => {
    const today = dayKey(NOW);
    expect(html(<DayLabel day={today} now={NOW} />).textContent).toBe("Today");
    const header = html(<DayHeader day="2026-09-19" now={NOW} />);
    expect(header.querySelector("h3")!.textContent).toBe("Sat, Sep 19");
    expect(header.querySelector("time")!.getAttribute("datetime")).toBe(
      "2026-09-19",
    );
  });
});

describe("detail lists", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("pairs labels and values and leaves out empty ones", () => {
    const host = html(
      <DefinitionList
        label="Details"
        items={[
          ["Local date", "Sep 22"],
          ["Domains", <Figure key="d" value={31} />],
          ["Profile", null],
          ["Empty", ""],
        ]}
      />,
    );
    expect(
      [...host.querySelectorAll("dt")].map((term) => term.textContent),
    ).toEqual(["Local date", "Domains"]);
    expect(host.querySelector("dl")!.getAttribute("aria-label")).toBe(
      "Details",
    );
    expect(html(<DefinitionList items={[["A", null]]} />).innerHTML).toBe("");
  });

  it("turns an app-keyed object into tiles with counts, largest first", () => {
    const host = html(
      <ValueChips
        field="browser_visits"
        value={{ safari: 3, chrome: 44, title_screened: 1 }}
      />,
    );
    const chips = [...host.querySelectorAll(".workspace-chip")];
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "44 visits",
      "3 visits",
      "Title screened1 visit",
    ]);
    expect(chips[0]!.querySelector('[data-mark="chrome"]')).not.toBeNull();
    expect(
      chips[0]!.querySelector('[role="img"]')!.getAttribute("aria-label"),
    ).toBe("Chrome");
    expect(chips[0]!.getAttribute("title")).toBe("Chrome: 44 visits");
    expect(host.querySelector("ul")!.getAttribute("aria-label")).toBe(
      "Browser visits",
    );
    expect(html(<ValueChips value={[1, 2]} />).innerHTML).toBe("");
    expect(
      html(<ValueChips value={{ complete: true, note: null }} />).textContent,
    ).toBe("CompleteYesNoteNone");
  });

  it("shortens ids and hashes and copies them whole", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const digest = "a".repeat(64);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<CopyValue value={digest} label="Source version" />));
    const code = host.querySelector("code")!;
    expect(code.textContent).toBe("a".repeat(12));
    expect(code.getAttribute("title")).toBe(digest);
    const button = host.querySelector<HTMLButtonElement>("button")!;
    expect(button.getAttribute("aria-label")).toBe("Copy source version");
    await act(async () => {
      button.click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith(digest);
    expect(
      host.querySelector('.workspace-copy-value > [role="status"]')!
        .textContent,
    ).toBe("Copied");
    act(() => root.unmount());
  });

  it("keeps the technical fields collapsed until asked", () => {
    const host = html(
      <TechnicalSection
        items={[
          { label: "Record ID", value: "rec_browsing_0922" },
          { label: "Source version", value: "b".repeat(64) },
          { label: "Coverage", value: null },
        ]}
      />,
    );
    const trigger = host.querySelector("[aria-expanded]")!;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.textContent).toContain("Technical");
    expect(html(<TechnicalSection items={[]} />).innerHTML).toBe("");
  });

  it("reads history as one short line per revision, in the viewer's zone", () => {
    const at = new Date(2026, 8, 22, 11, 30).getTime();
    const timeline = (
      <CompactTimeline
        label="Revision history"
        hashLabel="Source version"
        now={at}
        items={[
          {
            id: "r2",
            title: "Revision 2",
            at,
            hash: "c".repeat(64),
            current: true,
          },
          { id: "r1", title: "Revision 1", at: null, hash: null },
        ]}
      />
    );
    // The server writes the UTC clock; the browser writes its own.
    const served = html(timeline);
    expect(served.querySelector(".workspace-timeline-text")!.textContent).toBe(
      `Revision 2, ${clockText(at, at, true)}`,
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(timeline));
    const items = [...host.querySelectorAll("li")];
    expect(
      items[0]!.querySelector(".workspace-timeline-text")!.textContent,
    ).toBe("Revision 2, Sep 22, 11:30");
    expect(items[0]!.querySelector("code")!.textContent).toBe("c".repeat(12));
    expect(
      items[0]!
        .querySelector(".workspace-timeline-current")!
        .getAttribute("aria-label"),
    ).toBe("Current");
    // The others keep the dot's slot, unnamed, so the titles line up.
    expect(
      items[1]!
        .querySelector(".workspace-timeline-current")!
        .hasAttribute("aria-label"),
    ).toBe(false);
    expect(items[1]!.textContent).toBe("Revision 1");
    expect(host.querySelector("ol")!.getAttribute("aria-label")).toBe(
      "Revision history",
    );
    act(() => root.unmount());
  });
});
