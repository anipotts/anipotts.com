// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AdminUIProvider, AdminPortalScope } from "./AdminUI";
import { DataTable } from "./Workspace";
import { PersistenceStatus, WorkspaceMarkdown } from "./OpenAIContent";
import { useLayerContext } from "@astryxdesign/core/Layer";
import { chatkitTheme } from "../../lib/openai-theme";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const rows = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Beta" },
];
const columns = [
  {
    key: "title",
    header: "Title",
    sortable: true,
    render: (row: (typeof rows)[number]) => row.title,
  },
];
const base = {
  rows,
  columns,
  rowKey: "id" as const,
  label: "Articles",
  noun: ["article", "articles"] as [string, string],
};

describe("Core workspace boundary", () => {
  it("shares one admin-owned table without leaking the SDK boundary", () => {
    const legacy = renderToStaticMarkup(<DataTable {...base} />);
    expect(legacy).toContain("admin-data-table");
    expect(legacy).toContain("openai-record-table");
    expect(legacy).not.toContain("data-admin-ui");
    const migrated = renderToStaticMarkup(
      <AdminUIProvider enabled mode="dark">
        <DataTable {...base} />
      </AdminUIProvider>,
    );
    expect(migrated).toContain('data-admin-ui="core" data-theme="dark"');
    expect(migrated).toContain("openai-record-table");
    // Legacy table rules hide every non-first cell on phones. A selection
    // column would make the record title disappear if that class leaked in.
    const parsed = document.createElement("div");
    parsed.innerHTML = migrated;
    expect(parsed.querySelector(".workspace-table")).toBeNull();
    expect(migrated).toContain('scope="col"');
    expect(migrated).toContain('data-record-id="a"');
  });
  it("keeps table sorting, selection and paging controlled without losing other page selection", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const onSortChange = vi.fn(),
      onSelectionChange = vi.fn(),
      onPageChange = vi.fn();
    await act(async () =>
      root.render(
        <AdminUIProvider enabled mode="light">
          <DataTable
            {...base}
            sort={{ key: "title", direction: "asc" }}
            onSortChange={onSortChange}
            selectedKeys={new Set(["off-page"])}
            onSelectionChange={onSelectionChange}
            pagination={{ page: 0, pageSize: 2, total: 5, onPageChange }}
          />
        </AdminUIProvider>,
      ),
    );
    expect(host.querySelector("[data-pill]")).toBeNull();
    const sort = host.querySelector(
      'thead button:not([role="checkbox"])',
    ) as HTMLButtonElement;
    await act(async () => sort.click());
    expect(onSortChange).toHaveBeenCalledWith({
      key: "title",
      direction: "desc",
    });
    expect(host.querySelector("th[aria-sort]")?.getAttribute("aria-sort")).toBe(
      "ascending",
    );
    await act(async () =>
      (
        host.querySelector('tbody input[type="checkbox"]') as HTMLInputElement
      ).click(),
    );
    expect(onSelectionChange).toHaveBeenCalledWith(new Set(["off-page", "a"]));
    const next = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Next",
    )!;
    await act(async () => next.click());
    expect(onPageChange).toHaveBeenCalledWith(1);
    expect(host.textContent).toContain("Page 1 of 3");
    await act(async () => root.unmount());
    host.remove();
  });
  it("scopes only the owned portal and cleans its attributes on unmount", async () => {
    const host = document.createElement("div"),
      portal = document.createElement("div"),
      legacy = document.createElement("div");
    document.body.append(host, portal, legacy);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        <AdminUIProvider enabled mode="dark">
          {createPortal(
            <AdminPortalScope>
              <button>Menu action</button>
            </AdminPortalScope>,
            portal,
          )}
        </AdminUIProvider>,
      ),
    );
    expect(portal.dataset.adminUi).toBe("core");
    expect(portal.dataset.theme).toBe("dark");
    expect(document.body.dataset.adminUi).toBeUndefined();
    expect(legacy.dataset.adminUi).toBeUndefined();
    await act(async () => root.unmount());
    expect(portal.dataset.adminUi).toBeUndefined();
    host.remove();
    portal.remove();
    legacy.remove();
  });
  it("renders unsafe markdown as inert text and labels acknowledged destinations separately", () => {
    const html = renderToStaticMarkup(
      <AdminUIProvider enabled mode="light">
        <WorkspaceMarkdown>
          {"<script>alert(1)</script>\n\n[bad](javascript:alert(1))"}
        </WorkspaceMarkdown>
        <PersistenceStatus state="saved" destination="content drafts" />
      </AdminUIProvider>,
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("Saved to content drafts");
    expect(html).not.toContain("Published");
    expect(chatkitTheme("dark").colorScheme).toBe("dark");
    expect(chatkitTheme("dark").radius).toBe("soft");
  });
});

it("supplies Core layer context to descendants without fallback toast ownership", () => {
  let provided = false;
  function Probe() {
    provided = useLayerContext()?.isProvider === true;
    return null;
  }
  renderToStaticMarkup(
    <AdminUIProvider enabled>
      <Probe />
    </AdminUIProvider>,
  );
  expect(provided).toBe(true);
});

it("copies fenced Markdown code without interpreting HTML or math", async () => {
  const writeText = vi.fn(async (_value: string) => {});
  const originalClipboard = Object.getOwnPropertyDescriptor(
    navigator,
    "clipboard",
  );
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <AdminUIProvider enabled>
          <WorkspaceMarkdown>
            {"```js\nconst answer = 42;\n```\n\n$untrusted$"}
          </WorkspaceMarkdown>
        </AdminUIProvider>,
      ),
    );
    const copy = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy code"]',
    );
    expect(copy).not.toBeNull();
    await act(async () => copy!.click());
    expect(writeText).toHaveBeenCalledWith("const answer = 42;");
    expect(host.querySelector(".katex")).toBeNull();
    expect(host.textContent).toContain("$untrusted$");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    if (originalClipboard)
      Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});
