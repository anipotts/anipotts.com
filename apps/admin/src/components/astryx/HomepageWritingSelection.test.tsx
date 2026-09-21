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
  expect(host.textContent).toContain("unresolved selection");
  expect(host.textContent).toContain("not published");
  expect(onChange).not.toHaveBeenCalled();
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
it("adds only an explicitly chosen published article and disables all edits", async () => {
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
  expect(
    [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Add article",
    )!.disabled,
  ).toBe(true);
  act(() => {
    const select = host.querySelector("select")!;
    select.value = "live";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  act(() =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent === "Add article")!
      .click(),
  );
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
    [...host.querySelectorAll("button")].every((button) => button.disabled),
  ).toBe(true);
  expect(host.querySelector("select")!.disabled).toBe(true);
  expect(
    [...host.querySelectorAll("option")].map((option) => option.value),
  ).toEqual([""]);
  await act(async () => root.unmount());
});
