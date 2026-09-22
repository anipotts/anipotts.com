// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { DevReviewCatalog, reviewCatalogScenario } from "./dev-review-catalog";
import { saveStatusFromController } from "./SaveStatus";
import { EditorialApp } from "./EditorialApp";

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.unstubAllGlobals();
});

it("uses the actual review H1 sizing inside the shell with catalog context as an eyebrow", () => {
  const html = renderToStaticMarkup(
    <EditorialApp
      title="Component catalog"
      area="content"
      localPreview
      siteUrl="https://example.test"
      hideHeader
      searchEntries={[]}
    >
      <DevReviewCatalog />
    </EditorialApp>,
  );
  const doc = new DOMParser().parseFromString(html, "text/html");
  expect(
    [...doc.querySelectorAll("h1")].map((heading) => heading.textContent),
  ).toEqual(["Review changes"]);
  expect(
    doc.querySelector('[aria-label="Review catalog controls"]')?.textContent,
  ).toContain("Component catalog");
});

it.each([
  ["private", "saved-privately"],
  ["local", "saved-locally"],
  ["unchanged", "unchanged"],
  ["unsaved", "changed"],
  ["saving", "saving"],
  ["failed", "save-failed"],
  ["conflict", "conflict"],
] as const)(
  "derives %s from an actual autosave controller",
  async (scenario, expected) => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    const candidate = "A synthetic candidate with Unicode: café · 研究.";
    const fixture = reviewCatalogScenario(scenario, () => {}, candidate);
    if (scenario !== "saving" && scenario !== "unsaved")
      await fixture.controller.flush();
    expect(
      saveStatusFromController(fixture.controller.state, {
        localPreview: scenario === "local",
      }),
    ).toBe(expected);
    if (scenario !== "unchanged")
      expect(fixture.controller.state.source).toContain(candidate);
    expect(network).not.toHaveBeenCalled();
    fixture.dispose();
    await fixture.controller.flush();
  },
);

it("uses the real review controls with an explicit synthetic-save explanation", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  // The icon toggles' tooltips read the pointer type.
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      matches: false,
      media,
      addEventListener() {},
      removeEventListener() {},
    })),
  );
  const network = vi.fn();
  vi.stubGlobal("fetch", network);
  host = document.createElement("section");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<DevReviewCatalog />));
  const status = host.querySelector('[aria-label="Draft save status"]')!;
  const explanation = document.getElementById(
    status.getAttribute("aria-describedby")!,
  );
  expect(explanation?.textContent).toContain("do not save or publish content");
  expect(status.closest(".editor-review-title-row")).not.toBeNull();
  expect(host.querySelectorAll('[aria-label="Diff legend"]')).toHaveLength(1);
  const sourceButton = [...host.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") === "Source diff",
  )!;
  await act(async () => sourceButton.click());
  expect(host.querySelector(".editor-change")?.textContent).toContain(
    "card_copy:",
  );
  expect(host.textContent).not.toContain("Publish now");
  expect(network).not.toHaveBeenCalled();
});
