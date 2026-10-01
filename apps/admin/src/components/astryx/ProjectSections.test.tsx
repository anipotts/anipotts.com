// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ProjectFieldControls, ProjectSections } from "./ProjectSections";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { editProjectSections } from "../../lib/project-sections";
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

it("keeps incomplete sections removable beside their heading and exposes add actions directly", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  let source = setEditorialField(
    newProjectSource("example"),
    ["story"],
    [{ title: "", paragraphs: [""] }],
  );
  const onEdit = vi.fn((edit) => {
    source = editProjectSections(source, edit);
  });
  const render = async () =>
    act(async () =>
      root.render(
        <>
          <ProjectFieldControls
            data={parseEditorialSource(source).data as Record<string, unknown>}
            path={["story", "0", "title"]}
            position="before"
            onEdit={onEdit}
          />
          <ProjectSections source={source} onEdit={onEdit} />
        </>,
      ),
    );
  try {
    await render();
    expect(
      host.querySelectorAll('button[aria-label="Remove story section 1"]'),
    ).toHaveLength(1);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Remove story section 1"]',
        )!
        .click(),
    );
    expect((parseEditorialSource(source).data as any).story).toEqual([]);
    await render();
    await act(async () =>
      Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "Add technical section")!
        .click(),
    );
    expect((parseEditorialSource(source).data as any).technical).toEqual([
      { title: "", content: "" },
    ]);
    expect(host.querySelector('[aria-label="Add section"]')).toBeNull();
  } finally {
    act(() => root.unmount());
  }
});

it("places paragraph removal beside its field and adding at the end, keeping one paragraph", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const onEdit = vi.fn();
  const render = async (paragraphs: string[]) =>
    act(async () =>
      root.render(
        <>
          {paragraphs.map((_, paragraph) => (
            <ProjectFieldControls
              key={paragraph}
              data={{ story: [{ title: "Notes", paragraphs }] }}
              path={["story", "0", "paragraphs", String(paragraph)]}
              position="after"
              onEdit={onEdit}
            />
          ))}
        </>,
      ),
    );
  try {
    await render(["first", "second"]);
    expect(
      host.querySelectorAll('button[aria-label="Add paragraph to story 1"]'),
    ).toHaveLength(1);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Remove story 1 paragraph 1"]',
        )!
        .click(),
    );
    expect(onEdit).toHaveBeenLastCalledWith({
      type: "remove-paragraph",
      index: 0,
      paragraph: 0,
    });
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Add paragraph to story 1"]',
        )!
        .click(),
    );
    expect(onEdit).toHaveBeenLastCalledWith({ type: "paragraph", index: 0 });
    await render(["only"]);
    expect(
      host.querySelector('button[aria-label="Remove story 1 paragraph 1"]'),
    ).toBeNull();
    expect(
      host.querySelector('button[aria-label="Add paragraph to story 1"]'),
    ).not.toBeNull();
  } finally {
    act(() => root.unmount());
  }
});

it("moves the complete section from its adjacent header and respects disabled editing", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const onEdit = vi.fn();
  const render = async (disabled = false) =>
    act(async () =>
      root.render(
        <ProjectFieldControls
          data={{
            technical: [
              { title: "First", content: "one" },
              { title: "Second", content: "two" },
            ],
          }}
          path={["technical", "0", "title"]}
          position="before"
          disabled={disabled}
          onEdit={onEdit}
        />,
      ),
    );
  try {
    await render();
    expect(
      host.querySelector('button[aria-label="Move technical 1 up"]'),
    ).toBeNull();
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Move technical 1 down"]',
        )!
        .click(),
    );
    expect(onEdit).toHaveBeenCalledWith({
      type: "move",
      kind: "technical",
      index: 0,
      direction: 1,
    });
    await render(true);
    const calls = onEdit.mock.calls.length;
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Remove technical section 1"]',
        )!
        .click(),
    );
    expect(onEdit.mock.calls).toHaveLength(calls);
  } finally {
    act(() => root.unmount());
  }
});
