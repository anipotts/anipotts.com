// @vitest-environment jsdom
import React, { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArrowUpRightIcon } from "@phosphor-icons/react";
import { Button } from "@astryxdesign/core/Button";
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Popover } from "@astryxdesign/core/Popover";
import { Selector } from "@astryxdesign/core/Selector";
import { ContentLibrary } from "./ContentLibrary";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const relationshipSelector =
  "[aria-describedby],[aria-controls],[aria-labelledby],[aria-owns]";

// Every relationship attribute in the live document must resolve to an element.
function unresolvedInDocument() {
  return [...document.querySelectorAll(relationshipSelector)].flatMap(
    (element) =>
      ["aria-describedby", "aria-controls", "aria-labelledby", "aria-owns"]
        .map((name) => [name, element.getAttribute(name)] as const)
        .filter(([, value]) => value !== null)
        .flatMap(([name, value]) =>
          value === ""
            ? [`${name}=(empty)`]
            : value!
                .split(/\s+/)
                .filter((id) => !document.getElementById(id))
                .map((id) => `${name}=${id}`),
        ),
  );
}

function AdminLayers() {
  const [sort, setSort] = React.useState("attention");
  return (
    <>
      <IconButton
        label="Visit site"
        tooltip="Visit anipotts.com"
        variant="ghost"
        icon={<ArrowUpRightIcon size={18} aria-hidden="true" />}
      />
      <Popover
        label="Switch workspace"
        width="max-content"
        content={<span>Workspaces</span>}
      >
        <Button
          className="admin-workspace-selector"
          label="Content"
          tooltip="Switch workspace: Content"
          variant="secondary"
        />
      </Popover>
      <Popover label="Record details" content={<span>Details</span>}>
        {(trigger) => (
          <button type="button" className="render-prop-trigger" {...trigger}>
            Details
          </button>
        )}
      </Popover>
      <DropdownMenu
        button={{
          label: "Needs attention",
          tooltip: "Sort: Needs attention",
          size: "sm",
          variant: "secondary",
        }}
      >
        <DropdownMenuRadioGroup
          label="Sort records"
          value={sort}
          onChange={setSort}
        >
          <DropdownMenuRadioItem value="attention" label="Needs attention" />
          <DropdownMenuRadioItem value="title" label="Title" />
        </DropdownMenuRadioGroup>
      </DropdownMenu>
      <HoverCard content="Record details">
        <a className="hover-card-anchor" href="/content/writing/a">
          Draft
        </a>
      </HoverCard>
      <Selector
        label="Type"
        value="article"
        options={[
          { value: "article", label: "Article" },
          { value: "note", label: "Note" },
        ]}
        onChange={() => undefined}
      />
    </>
  );
}

describe("hydrating Astryx relationship attributes", () => {
  let host: HTMLDivElement;
  let root: Root | undefined;
  let consoleError: ReturnType<typeof vi.spyOn>;
  let recoverable: unknown[];

  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    consoleError = vi.spyOn(console, "error");
    recoverable = [];
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = undefined;
    host.remove();
    consoleError.mockRestore();
    vi.unstubAllGlobals();
  });

  // Returns the references that were unresolved in the server markup alone.
  const hydrate = async (node: React.ReactElement) => {
    host.innerHTML = renderToString(node);
    const beforeHydration = unresolvedInDocument();
    await act(async () => {
      root = hydrateRoot(host, node, {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });
    return beforeHydration;
  };

  it("detects a server and client attribute mismatch in this harness", async () => {
    function Mismatch() {
      return (
        <button
          type="button"
          aria-describedby={typeof window === "undefined" ? undefined : "x"}
        >
          Mismatch
        </button>
      );
    }
    const original = globalThis.window;
    // Render the server half as if no window existed.
    Reflect.deleteProperty(globalThis, "window");
    const html = renderToString(<Mismatch />);
    Object.assign(globalThis, { window: original });
    host.innerHTML = html;
    await act(async () => {
      root = hydrateRoot(host, <Mismatch />, {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });
    expect(
      consoleError.mock.calls.some((call) =>
        String(call[0]).includes("didn't match"),
      ),
    ).toBe(true);
  });

  it("hydrates admin layer triggers without mismatches, then resolves every reference", async () => {
    const serverReferences = await hydrate(<AdminLayers />);

    expect(serverReferences).toEqual([]);
    expect(recoverable).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
    expect(unresolvedInDocument()).toEqual([]);

    const visit = host.querySelector<HTMLElement>('[aria-label="Visit site"]')!;
    const description = document.getElementById(
      visit.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.getAttribute("role")).toBe("tooltip");
    expect(description?.textContent).toBe("Visit anipotts.com");

    const workspace = host.querySelector<HTMLElement>(
      ".admin-workspace-selector",
    )!;
    expect(workspace.getAttribute("aria-controls")).toBeTruthy();
    expect(
      workspace
        .getAttribute("aria-describedby")
        ?.split(" ")
        .map((id) => document.getElementById(id)?.textContent),
    ).toContain("Switch workspace: Content");

    const renderProp = host.querySelector<HTMLElement>(".render-prop-trigger")!;
    expect(
      document.getElementById(renderProp.getAttribute("aria-controls") ?? ""),
    ).not.toBeNull();

    const anchor = host.querySelector<HTMLElement>(".hover-card-anchor")!;
    expect(anchor.hasAttribute("aria-describedby")).toBe(false);

    const combobox = host.querySelector<HTMLElement>('[role="combobox"]')!;
    expect(
      document
        .getElementById(combobox.getAttribute("aria-controls") ?? "")
        ?.getAttribute("role"),
    ).toBe("listbox");

    const sort = host.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
    await act(async () => sort.click());
    expect(sort.getAttribute("aria-expanded")).toBe("true");
    const menu = document.getElementById(
      sort.getAttribute("aria-controls") ?? "",
    );
    expect(menu?.getAttribute("role")).toBe("menu");
    expect(menu?.textContent).toContain("Title");
    expect(unresolvedInDocument()).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("hydrates the Content library without mismatches or dangling references", async () => {
    const serverReferences = await hydrate(
      <ContentLibrary
        groups={[
          {
            name: "writing",
            href: "/content?group=writing",
            records: [
              {
                title: "Post",
                href: "/content/writing/b",
                status: "published",
                changesPending: true,
              },
              {
                title: "Draft",
                href: "/content/writing/a",
                status: "draft",
                changesPending: false,
              },
            ],
          },
        ]}
        selectedGroup="writing"
      />,
    );

    expect(serverReferences).toEqual([]);
    expect(recoverable).toEqual([]);
    expect(consoleError).not.toHaveBeenCalled();
    expect(unresolvedInDocument()).toEqual([]);
    const menus = [
      ...host.querySelectorAll<HTMLElement>('[aria-haspopup="menu"]'),
    ];
    expect(menus.length).toBeGreaterThan(0);
    for (const trigger of menus) {
      expect(trigger.getAttribute("aria-controls")).toBeTruthy();
    }
  });
});
