// @vitest-environment jsdom
import React, { act, useEffect, useState } from "react";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import type { CatalogGroup, CatalogRecord } from "./EditorialApp";
import { ContentLibrary, Updated } from "./ContentLibrary";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// Astryx Timestamp builds three Intl.DateTimeFormat instances on every render
// (visible text, aria-label and tooltip line). Counting constructions counts
// Timestamp renders without reaching into Astryx internals.
const OriginalDateTimeFormat = Intl.DateTimeFormat;
let formatterCount = 0;
function countFormatters() {
  formatterCount = 0;
  Intl.DateTimeFormat = new Proxy(OriginalDateTimeFormat, {
    construct(target, args, newTarget) {
      formatterCount += 1;
      return Reflect.construct(target, args, newTarget);
    },
    apply(target, thisArg, args) {
      formatterCount += 1;
      return Reflect.apply(target, thisArg, args);
    },
  });
}

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  Intl.DateTimeFormat = OriginalDateTimeFormat;
});

const sources = ["git", "local", "private"] as const;
function records(count: number): CatalogRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    title: `Record ${index}`,
    href: `/content/writing/record-${index}`,
    status: "published",
    updated: {
      at: new Date(Date.UTC(2026, 8, 1 + index, 12)).toISOString(),
      source: sources[index % sources.length],
    },
  }));
}
const RECORDS = 12;
const groups: CatalogGroup[] = [
  {
    name: "writing",
    href: "/content?group=writing",
    records: records(RECORDS),
  },
];

// Mirrors EditorialApp: a mount effect schedules a root update with unchanged
// library props, which is what used to re-render every dehydrated Timestamp.
function Island({ onCommit }: { onCommit?: () => void }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    setTick(1);
  }, []);
  useEffect(() => {
    onCommit?.();
  });
  return <ContentLibrary groups={groups} selectedGroup="writing" />;
}

function timestampCount(element: ParentNode) {
  return element.querySelectorAll("time").length;
}

describe("Updated", () => {
  it("does not re-render its Timestamp when a parent re-renders with equal props", async () => {
    host = document.createElement("div");
    document.body.append(host);
    let rerender: (() => void) | undefined;
    function Parent() {
      const [tick, setTick] = useState(0);
      rerender = () => setTick((value) => value + 1);
      return (
        <>
          <span data-tick={tick} />
          <Updated
            // a fresh object each render, equal by value, as a re-projected row would be
            updated={{ at: "2026-09-10T12:00:00.000Z", source: "private" }}
            column
          />
        </>
      );
    }
    root = createRoot(host);
    await act(async () => root!.render(<Parent />));
    const before = host.querySelector("time")?.outerHTML;
    countFormatters();
    await act(async () => rerender!());
    expect(formatterCount).toBe(0);
    expect(host.querySelector("time")?.outerHTML).toBe(before);
  });

  it("still re-renders when the recorded time or source changes", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <Updated updated={{ at: "2026-09-10T12:00:00.000Z", source: "git" }} />,
      ),
    );
    expect(host.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-09-10T12:00:00.000Z",
    );
    expect(host.textContent).not.toContain("Local edit");
    await act(async () =>
      root!.render(
        <Updated
          updated={{ at: "2026-09-11T08:30:00.000Z", source: "local" }}
        />,
      ),
    );
    expect(host.querySelector("time")?.getAttribute("datetime")).toBe(
      "2026-09-11T08:30:00.000Z",
    );
    expect(host.textContent).toContain("Local edit");
    await act(async () => root!.render(<Updated updated={undefined} column />));
    expect(host.querySelector("time")).toBeNull();
    expect(host.textContent).toBe("Not recorded");
  });

  it("hydrates each library Timestamp once when a mount effect updates the island", async () => {
    const html = renderToString(<Island />);
    host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    // the library renders each record's Updated cell in more than one layout
    const timestamps = timestampCount(host);
    expect(timestamps).toBeGreaterThanOrEqual(RECORDS);
    countFormatters();
    await act(async () => {
      root = hydrateRoot(host!, <Island />);
    });
    // let the lazy hover card chunk resolve and any retried boundaries settle
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    expect(timestampCount(host)).toBe(timestamps);
    expect(formatterCount).toBeLessThanOrEqual(3 * timestamps);
    const hydrated = formatterCount;
    countFormatters();
    let commits = 0;
    await act(async () =>
      root!.render(<Island onCommit={() => (commits += 1)} />),
    );
    expect(commits).toBeGreaterThan(0);
    expect(formatterCount).toBe(0);
    expect(hydrated).toBeGreaterThan(0);
  });

  it("keeps the tooltip label for each update source", async () => {
    const labels: Record<(typeof sources)[number], string> = {
      git: "Latest Git change",
      local: "Local edit",
      private: "Private draft saved",
    };
    for (const source of sources) {
      host = document.createElement("div");
      document.body.append(host);
      root = createRoot(host);
      await act(async () =>
        root!.render(
          <Updated updated={{ at: "2026-09-10T12:00:00.000Z", source }} />,
        ),
      );
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      const time = host.querySelector("time")!;
      await act(async () => {
        time.focus();
        time.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      const card = host.querySelector('[role="dialog"]');
      expect(card?.getAttribute("aria-label")).toBe("Timestamp details");
      const rows = [...(card?.querySelectorAll("dt") ?? [])];
      expect(rows.map((row) => row.textContent)).toEqual([labels[source]]);
      expect(rows[0].nextElementSibling?.textContent).toContain(
        "September 10, 2026",
      );
      act(() => root!.unmount());
      host.remove();
      root = undefined;
      host = undefined;
    }
  });
});
