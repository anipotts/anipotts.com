// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { HomepageWritingSelection } from "./HomepageWritingSelection";

vi.mock("@astryxdesign/core/Selector", () => ({
  Selector: ({ label, value, options, isDisabled, onChange }: any) => (
    <select
      aria-label={label}
      value={value}
      disabled={isDisabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option: any) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const options = [
  { slug: "live", title: "Live article", status: "published" },
  { slug: "private", title: "Private article", status: "draft" },
  { slug: "later", title: "Scheduled article", status: "scheduled" },
];
it("retains unresolved and unpublished selections while moving or removing only the requested position", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const onChange = vi.fn();
  const value = ["missing", "private", "missing"];
  await act(async () =>
    root.render(
      <HomepageWritingSelection
        value={value}
        options={options}
        onChange={onChange}
      />,
    ),
  );
  // Only exceptions carry a chip: an address that resolves to nothing, and
  // an article that is not published.
  expect(host.textContent).toContain("Unresolved");
  expect(host.textContent).toContain("Not published");
  expect(onChange).not.toHaveBeenCalled();
  // Up, down and remove keep their columns: a move that does not apply
  // leaves an empty slot, so every row has three.
  for (const row of host.querySelectorAll(".editor-homepage-row"))
    expect(row.querySelectorAll("button, .editor-homepage-slot")).toHaveLength(
      3,
    );
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Move selection 2 up"]')!
      .click(),
  );
  expect(onChange).toHaveBeenLastCalledWith(["private", "missing", "missing"]);
  act(() =>
    host
      .querySelector<HTMLButtonElement>('[aria-label="Remove selection 3"]')!
      .click(),
  );
  expect(onChange).toHaveBeenLastCalledWith(["missing", "private"]);
  expect(value).toEqual(["missing", "private", "missing"]);
  await act(async () => root.unmount());
});
it("adds a published article as soon as it is chosen and disables all edits", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const onChange = vi.fn();
  await act(async () =>
    root.render(
      <HomepageWritingSelection
        value={["missing"]}
        options={options}
        onChange={onChange}
      />,
    ),
  );
  expect(
    [...host.querySelectorAll("option")].map((option) => option.value),
  ).toEqual(["", "live"]);
  expect(onChange).not.toHaveBeenCalled();
  // Choosing an article adds it at once.
  act(() => {
    const select = host.querySelector("select")!;
    select.value = "live";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(onChange).toHaveBeenLastCalledWith(["missing", "live"]);
  await act(async () =>
    root.render(
      <HomepageWritingSelection
        value={["missing", "live"]}
        options={options}
        disabled
        onChange={onChange}
      />,
    ),
  );
  expect(
    [...host.querySelectorAll("button")].every(
      (button) =>
        button.disabled || button.getAttribute("aria-disabled") === "true",
    ),
  ).toBe(true);
  expect(host.querySelector("select")!.disabled).toBe(true);
  expect(
    [...host.querySelectorAll("option")].map((option) => option.value),
  ).toEqual([""]);
  await act(async () => root.unmount());
});
