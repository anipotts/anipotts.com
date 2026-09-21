// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProjectSections } from "./ProjectSections";
import { newProjectSource } from "../../lib/project-draft";
import { setEditorialField } from "@anipotts/content/editorial/source";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("shows roadmap validation beside its controls while keeping removal available", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const onEdit = vi.fn();
  const source = setEditorialField(
    newProjectSource("example"),
    ["roadmap"],
    [{ text: "Keep this", status: "unknown" }],
  );
  try {
    await act(async () =>
      root.render(
        <ProjectSections
          source={source}
          errors={new Map([["roadmap.0.status", "Choose a supported status."]])}
          onEdit={onEdit}
        />,
      ),
    );
    expect(host.textContent).toContain("Choose a supported status.");
    const remove = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove roadmap item 1"]',
    )!;
    expect(remove.disabled).toBe(false);
    await act(async () => remove.click());
    expect(onEdit).toHaveBeenCalledWith({
      type: "remove",
      kind: "roadmap",
      index: 0,
    });
  } finally {
    act(() => root.unmount());
  }
});

it("keeps malformed section entries removable instead of crashing", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const onEdit = vi.fn();
  let source = newProjectSource("example");
  for (const kind of ["story", "technical", "roadmap"])
    source = setEditorialField(source, [kind], [null]);
  try {
    await act(async () =>
      root.render(<ProjectSections source={source} onEdit={onEdit} />),
    );
    for (const [label, kind] of [
      ["Remove story section 1", "story"],
      ["Remove technical section 1", "technical"],
      ["Remove roadmap item 1", "roadmap"],
    ]) {
      const button = host.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      )!;
      expect(button.disabled).toBe(false);
      await act(async () => button.click());
      expect(onEdit).toHaveBeenLastCalledWith({
        type: "remove",
        kind,
        index: 0,
      });
    }
  } finally {
    act(() => root.unmount());
  }
});
