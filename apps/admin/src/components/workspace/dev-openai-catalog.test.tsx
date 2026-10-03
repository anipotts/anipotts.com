// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_API, FIXTURE_THREAD } from "./dev-openai-fixture";

const captured = vi.hoisted(() => ({
  transport: undefined as typeof fetch | undefined,
}));
// Only the remote hosted renderer is mocked. Controls, table, theme, state and
// the fixture protocol are exercised as shipped.
vi.mock("@openai/chatkit-react", () => ({
  useChatKit: (options: { api: { fetch: typeof fetch } }) => {
    captured.transport = options.api.fetch;
    return { control: {}, fetchUpdates: async () => {} };
  },
  ChatKit: () => <div data-chatkit-fixture />,
}));
import { DevOpenAICatalog } from "./dev-openai-catalog";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
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
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<DevOpenAICatalog />));
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});
function input(selector: string, value: string) {
  const el = host.querySelector<HTMLInputElement>(selector)!;
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function click(text: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (el) => el.textContent?.trim() === text,
  );
  expect(button, `button ${text}`).toBeDefined();
  act(() => button!.click());
}
function choose(label: string, value: string) {
  const trigger = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  )!;
  act(() =>
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  const option = Array.from(
    document.querySelectorAll('[role="menuitemradio"]'),
  ).find((el) => el.textContent?.trim() === value);
  expect(option, `menu ${label} option ${value}`).toBeDefined();
  act(() => (option as HTMLElement).click());
}
async function card() {
  const response = await captured.transport!(FIXTURE_API, {
    method: "POST",
    body: JSON.stringify({
      type: "threads.get_by_id",
      params: { thread_id: FIXTURE_THREAD },
    }),
  });
  return JSON.stringify(await response.json());
}

describe("admin components catalog", () => {
  it("shares only acknowledged edits between form, table, detail and ChatKit projection", async () => {
    expect(host.textContent).toContain("Synthetic records");
    expect(host.querySelector("[data-chatkit-fixture]")).not.toBeNull();
    input("#fixture-title", "An acknowledged synthetic title");
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Unsaved draft",
    );
    expect(host.querySelector("h3")?.textContent).toBe(
      "A quieter writing workspace",
    );
    expect(await card()).not.toContain("An acknowledged synthetic title");
    const nativeSubmit = vi.fn();
    host.querySelector("form")!.addEventListener("submit", nativeSubmit);
    click("Simulate save / retry");
    expect(nativeSubmit).not.toHaveBeenCalled();
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Simulated saving",
    );
    expect(await card()).not.toContain("An acknowledged synthetic title");
    click("Acknowledge save");
    expect(host.querySelector("h3")?.textContent).toBe(
      "An acknowledged synthetic title",
    );
    expect(host.querySelector(".dev-openai-record")?.textContent).toContain(
      "An acknowledged synthetic title",
    );
    expect(await card()).toContain("An acknowledged synthetic title");
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Acknowledged revision 2",
    );
  });
  it("filters the displayed rows while keeping the selected detail and synthetic source intact", async () => {
    input('[aria-label="Search synthetic articles"]', "note 12");
    const rows = host.querySelectorAll(".dev-openai-record");
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain("note 12");
    expect(host.querySelector("h3")?.textContent).toBe(
      "A quieter writing workspace",
    );
    act(() => (rows[0] as HTMLButtonElement).click());
    expect(host.querySelector("h3")?.textContent).toBe(
      "Synthetic writing note 12",
    );
    expect(await card()).toContain("Synthetic writing note 12");
    expect(
      (
        host.querySelector(
          '[aria-label="Search synthetic articles"]',
        ) as HTMLInputElement
      ).value,
    ).toBe("note 12");
    input('[aria-label="Search synthetic articles"]', "no fixture matches");
    expect(host.querySelectorAll(".dev-openai-record").length).toBe(0);
  });
  it("keeps stable selection through paging and resets paging when filters change", () => {
    const checkbox = host.querySelector<HTMLInputElement>(
      'tbody input[type="checkbox"]',
    );
    expect(checkbox).not.toBeNull();
    act(() => checkbox!.click());
    expect(host.textContent).toContain("1 selected");
    click("Next");
    expect(host.textContent).toContain("Page 2 of 3");
    expect(host.textContent).toContain("1 selected");
    click("Previous");
    expect(
      host
        .querySelector('tr[data-record-id="synthetic-1"]')
        ?.getAttribute("data-selected"),
    ).toBe("true");
    click("Next");
    choose("Publication filter", "draft");
    expect(host.textContent).toContain("Page 1 of 1");
    expect(host.querySelectorAll(".dev-openai-record").length).toBe(4);
  });
  it("exposes deterministic loading, empty and failure scenarios without dropping dirty text", () => {
    input("#fixture-title", "Unsaved synthetic draft");
    choose("Simulated scenario", "loading");
    expect(host.querySelector('[aria-busy="true"]')?.textContent).toContain(
      "Loading synthetic records",
    );
    choose("Simulated scenario", "empty");
    expect(host.querySelectorAll(".dev-openai-record").length).toBe(0);
    for (const scenario of ["failed", "stale", "disconnected", "conflict"]) {
      choose("Simulated scenario", scenario);
      expect(
        (host.querySelector("#fixture-title") as HTMLInputElement).value,
      ).toBe("Unsaved synthetic draft");
      expect(host.querySelector("h3")?.textContent).toBe(
        "A quieter writing workspace",
      );
    }
    click("Reset scenario");
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Unsaved draft",
    );
  });
  it("prevents keyboard form submission and declares every action a non-submit button", () => {
    const event = new Event("submit", { bubbles: true, cancelable: true });
    act(() => host.querySelector("form")!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Simulated saving",
    );
    for (const button of host.querySelectorAll("form button"))
      expect(button.getAttribute("type")).toBe("button");
  });
  it("keeps fixture controls on the tighter non-pill shape", () => {
    expect(
      host.querySelectorAll(".dev-openai-controls button[data-pill]").length,
    ).toBe(0);
  });
});
