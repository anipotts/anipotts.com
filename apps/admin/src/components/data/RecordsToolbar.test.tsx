// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordsToolbar } from "./RecordsView";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const host = document.createElement("div");
document.body.appendChild(host);
const root = createRoot(host);
afterEach(() => act(() => root.render(null)));

describe("record filter overflow", () => {
  it("keeps two shortcuts and opens the remaining kinds in an accessible menu", async () => {
    const navigate = vi.fn();
    await act(() =>
      root.render(
        <RecordsToolbar
          route={{ view: "records", kind: "all", source: null, id: null }}
          navigate={navigate}
        />,
      ),
    );
    expect(
      [...host.querySelectorAll("[aria-pressed]")].map(
        (button) => button.getAttribute("aria-label") ?? button.textContent,
      ),
    ).toEqual(["Messages", "Browsing"]);
    const trigger = host.querySelector<HTMLButtonElement>(
      '[aria-label="More types: All kinds"]',
    )!;
    expect(trigger).not.toBeNull();
    await act(() => trigger.click());
    const contacts = [
      ...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
    ].find((item) => item.textContent?.includes("Contacts"));
    expect(contacts).toBeDefined();
    await act(() => contacts!.click());
    expect(navigate).toHaveBeenCalledWith("/data/records?kind=contact", {
      replace: true,
    });
  });
  it("names an active overflow kind and prevents interaction when disabled", async () => {
    await act(() =>
      root.render(
        <RecordsToolbar
          route={{ view: "records", kind: "contact", source: null, id: null }}
          navigate={vi.fn()}
          disabled
        />,
      ),
    );
    expect(
      host.querySelector('[aria-label="More types: Contacts"]'),
    ).not.toBeNull();
    expect(host.querySelector("[inert]")).not.toBeNull();
  });
});
