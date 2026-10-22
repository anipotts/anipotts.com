// @vitest-environment jsdom
import React, { act, useState, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminUIProvider } from "../workspace/AdminUI";
import { ProjectSettings } from "./ProjectSettings";
import { ProjectSections, ProjectFieldControls } from "./ProjectSections";
import { ProjectMedia } from "./ProjectMedia";
import { newProjectSource } from "../../lib/project-draft";
import { editProjectSections } from "../../lib/project-sections";
import { editProjectMedia } from "../../lib/project-media";
import {
  parseEditorialSource,
  setEditorialField,
} from "@anipotts/content/editorial/source";

type UploadProps = ComponentProps<
  typeof import("./ArticleImageUpload").ArticleImageUpload
>;
const uploads = vi.hoisted(() => [] as UploadProps[]);
vi.mock("./ArticleImageUpload", () => ({
  ArticleImageUpload: (props: UploadProps) => {
    uploads.push(props);
    return <button disabled={props.disabled}>Synthetic upload</button>;
  },
}));
let host: HTMLDivElement, root: Root, source: string;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  uploads.length = 0;
  source = newProjectSource("synthetic-project") + "Retained body.\n";
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function Fixture({ enabled = true, disabled = false }) {
  const [current, setCurrent] = useState(source);
  const change = (next: string) => {
    source = next;
    setCurrent(next);
  };
  const data = parseEditorialSource(current).data as Record<string, unknown>;
  return (
    <AdminUIProvider enabled={enabled} mode="light">
      <ProjectSettings
        source={current}
        errors={new Map([["category", "Choose a supported category."]])}
        disabled={disabled}
        onChange={change}
      />
      <ProjectFieldControls
        data={data}
        path={["story", "0", "title"]}
        position="before"
        disabled={disabled}
        onEdit={(edit) => change(editProjectSections(current, edit))}
      />
      <ProjectSections
        source={current}
        disabled={disabled}
        onEdit={(edit) => change(editProjectSections(current, edit))}
      />
      <ProjectMedia
        source={current}
        errors={new Map()}
        siteUrl="https://example.com"
        disabled={disabled}
        onEdit={(edit) => change(editProjectMedia(current, edit))}
        onPendingChange={() => {}}
      />
      {Array.isArray(data.story) &&
        data.story.map((_, index) => (
          <ProjectMedia
            key={index}
            storyIndex={index}
            source={current}
            errors={new Map()}
            siteUrl="https://example.com"
            disabled={disabled}
            onEdit={(edit) => change(editProjectMedia(current, edit))}
            onPendingChange={() => {}}
          />
        ))}
    </AdminUIProvider>
  );
}
function field(label: string) {
  const target = [...host.querySelectorAll("label")].find(
    (item) => item.textContent === label,
  );
  expect(target, label).toBeDefined();
  return host.querySelector<HTMLInputElement>(`[id="${target!.htmlFor}"]`)!;
}
function input(label: string, value: string) {
  const target = field(label);
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(target, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
  return target;
}
function button(label: string) {
  const target = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) =>
      item.getAttribute("aria-label") === label || item.textContent === label,
  );
  expect(target, label).toBeDefined();
  return target!;
}
function selector(label: string) {
  const trigger = [
    ...host.querySelectorAll<HTMLButtonElement>('button[role="combobox"]'),
  ].find((button) =>
    [...(button.labels ?? [])].some(
      (item) => item.textContent?.trim() === label,
    ),
  );
  expect(trigger, label).toBeDefined();
  return trigger!;
}
function open(label: string) {
  const trigger = selector(label);
  act(() =>
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    ),
  );
  return trigger;
}
function choose(label: string, value: string) {
  const trigger = open(label);
  const listbox = document.getElementById(
    trigger.getAttribute("aria-controls")!,
  );
  expect(listbox?.getAttribute("role")).toBe("listbox");
  const option = [
    ...listbox!.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((item) => item.textContent === value);
  expect(option, value).toBeDefined();
  act(() => option!.click());
}

it("round-trips project metadata through actual Core fields while retaining body and unrelated frontmatter", () => {
  source = setEditorialField(source, ["retained_extension"], "keep me");
  act(() => root.render(<Fixture />));
  input("Role", "Engineering");
  choose("Category", "Product");
  choose("Website visibility", "Listed");
  choose("Homepage section", "Work");
  choose("Project group", "Past");
  input("Website link", "https://example.com/project");
  const order = input("Homepage order", "12");
  expect(
    (parseEditorialSource(source).data as Record<string, unknown>)
      .homepage_order,
  ).toBeUndefined();
  act(() =>
    order.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    ),
  );
  const tags = input("Tags", "interfaces, tools,");
  expect(tags.value).toBe("");
  const parsed = parseEditorialSource(source);
  expect(parsed.data).toMatchObject({
    role: "Engineering",
    category: "product",
    public_state: "listed",
    homepage_placement: "work",
    catalog_group: "past",
    homepage_order: 12,
    tags: ["interfaces", "tools"],
    link_live: "https://example.com/project",
    retained_extension: "keep me",
  });
  expect(parsed.body).toContain("Retained body.");
  input("Website link", "");
  expect(parseEditorialSource(source).data).not.toHaveProperty("link_live");
  const category = selector("Category");
  expect(category.getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(category.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("Choose a supported category.");
});

it("keeps Hidden unavailable in the visibility menu so taking down remains a reviewed action", () => {
  source = setEditorialField(source, ["public_state"], "listed");
  act(() => root.render(<Fixture />));
  open("Website visibility");
  const hidden = [
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((item) => item.textContent === "Hidden")!;
  expect(hidden.getAttribute("aria-disabled")).toBe("true");
  act(() => hidden.click());
  expect(
    (parseEditorialSource(source).data as Record<string, unknown>).public_state,
  ).toBe("listed");
});

it("moves story media with its section and edits roadmap and image metadata through shared controls", () => {
  source = setEditorialField(
    source,
    ["story"],
    [
      {
        title: "First",
        paragraphs: ["One"],
        media: { kind: "image", src: "/favicon-32x32.png", alt: "First image" },
      },
      { title: "Second", paragraphs: ["Two"] },
    ],
  );
  source = setEditorialField(
    source,
    ["roadmap"],
    [{ text: "Ship", status: "planned" }],
  );
  source = setEditorialField(source, ["preview_media"], {
    kind: "image",
    src: "/favicon-32x32.png",
    alt: "Preview",
  });
  act(() => root.render(<Fixture />));
  act(() => button("Move story 1 down").click());
  expect(
    (parseEditorialSource(source).data as Record<string, unknown>).story,
  ).toEqual([
    { title: "Second", paragraphs: ["Two"] },
    {
      title: "First",
      paragraphs: ["One"],
      media: { kind: "image", src: "/favicon-32x32.png", alt: "First image" },
    },
  ]);
  input("Roadmap item 1", "Review before shipping");
  choose("Roadmap item 1 status", "In progress");
  input("Story 2 image caption", "Media stayed with the moved section");
  expect(
    (parseEditorialSource(source).data as Record<string, unknown>).story,
  ).toMatchObject([
    { title: "Second" },
    {
      title: "First",
      media: {
        alt: "First image",
        caption: "Media stayed with the moved section",
      },
    },
  ]);
  input("Preview alt text", "A synthetic preview");
  choose("Preview fit", "Contain");
  expect(parseEditorialSource(source).data).toMatchObject({
    roadmap: [{ text: "Review before shipping", status: "in-progress" }],
    preview_media: { alt: "A synthetic preview", fit: "contain" },
  });
  act(() => button("Remove preview").click());
  expect(
    (parseEditorialSource(source).data as Record<string, unknown>)
      .preview_media,
  ).toBeNull();
});

it.each([false, true])(
  "disabled project controls retain the source and block all media callbacks (workspace boundary=%s)",
  (enabled) => {
    const original = source;
    act(() => root.render(<Fixture enabled={enabled} disabled />));
    expect(field("Role").disabled).toBe(true);
    expect(field("Homepage order").disabled).toBe(true);
    expect(button("Add story section").disabled).toBe(true);
    for (const upload of uploads)
      act(() => upload.onUploaded("/favicon-32x32.png"));
    expect(source).toBe(original);
  },
);
