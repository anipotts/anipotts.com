// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectMedia } from "./ProjectMedia";
import { editProjectMedia } from "../../lib/project-media";
import { setEditorialField } from "@anipotts/content/editorial/source";
import { newProjectSource } from "../../lib/project-draft";
const uploads = vi.hoisted(() => ({ props: [] as any[] }));
vi.mock("./ArticleImageUpload", () => ({
  ArticleImageUpload: (props: any) => {
    uploads.props.push(props);
    return <span>Upload fixture</span>;
  },
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  uploads.props = [];
});
it("emits source-independent upload mutations and aggregates simultaneous pending uploads", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const onEdit = vi.fn();
  const pending = vi.fn();
  await act(async () =>
    root.render(
      <ProjectMedia
        source={newProjectSource("example")}
        errors={new Map()}
        siteUrl="https://anipotts.com"
        onEdit={onEdit}
        onPendingChange={pending}
      />,
    ),
  );
  const [logo, preview] = uploads.props;
  act(() => {
    logo.onPendingChange(true);
    preview.onPendingChange(true);
    logo.onPendingChange(false);
  });
  expect(pending.mock.calls.map((call) => call[0])).toEqual([true, true, true]);
  act(() => preview.onPendingChange(false));
  expect(pending).toHaveBeenLastCalledWith(false);
  const src = `/images/editorial/${"a".repeat(64)}.png`;
  act(() => logo.onUploaded(src));
  expect(onEdit).toHaveBeenCalledWith({ type: "upload", slot: "logo", src });
  await act(async () =>
    root.render(
      <ProjectMedia
        source={newProjectSource("example")}
        errors={new Map()}
        disabled
        siteUrl="https://anipotts.com"
        onEdit={onEdit}
        onPendingChange={pending}
      />,
    ),
  );
  act(() => preview.onUploaded(src));
  expect(onEdit).toHaveBeenCalledTimes(1);
  act(() => root.unmount());
  act(() => logo.onUploaded(src));
  expect(onEdit).toHaveBeenCalledTimes(1);
  expect(pending).toHaveBeenLastCalledWith(false);
});

it("makes reference removal explicit and unavailable during image processing", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const onEdit = vi.fn();
  const src = `/images/editorial/${"b".repeat(64)}.png`;
  let source = editProjectMedia(newProjectSource("example"), {
    type: "upload",
    slot: "logo",
    src,
  });
  source = editProjectMedia(source, { type: "upload", slot: "preview", src });
  await act(async () =>
    root.render(
      <ProjectMedia
        source={source}
        errors={new Map()}
        siteUrl="https://anipotts.com"
        onEdit={onEdit}
        onPendingChange={() => {}}
      />,
    ),
  );
  const remove = () =>
    [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Remove preview",
    )!;
  expect(remove()).toBeTruthy();
  act(() => uploads.props[0].onPendingChange(true));
  expect(remove().disabled).toBe(true);
  act(() => remove().click());
  expect(onEdit).not.toHaveBeenCalled();
  act(() => uploads.props[0].onPendingChange(false));
  act(() => remove().click());
  expect(onEdit).toHaveBeenCalledWith({ type: "remove", slot: "preview" });
  act(() => root.unmount());
});

it("captures story identity for an upload and reuses preview controls without a logo", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const onEdit = vi.fn();
  const section = { title: "Story", paragraphs: ["Text"] };
  const source = setEditorialField(
    newProjectSource("example"),
    ["story"],
    [section],
  );
  await act(async () =>
    root.render(
      <ProjectMedia
        source={source}
        storyIndex={0}
        errors={new Map()}
        siteUrl="https://anipotts.com"
        onEdit={onEdit}
        onPendingChange={() => {}}
      />,
    ),
  );
  expect(host.textContent).toContain("Story 1 media");
  expect(host.textContent).not.toContain("Project logo");
  expect(uploads.props).toHaveLength(1);
  const upload = uploads.props[0];
  const current = setEditorialField(
    source,
    ["story"],
    [{ title: "Replacement", paragraphs: ["Other"] }],
  );
  await act(async () =>
    root.render(
      <ProjectMedia
        source={current}
        storyIndex={0}
        errors={new Map()}
        siteUrl="https://anipotts.com"
        onEdit={onEdit}
        onPendingChange={() => {}}
      />,
    ),
  );
  const src = `/images/editorial/${"c".repeat(64)}.png`;
  act(() => upload.onUploaded(src));
  expect(onEdit).toHaveBeenCalledWith({
    type: "story-media",
    index: 0,
    expectedSection: JSON.stringify(section),
    edit: { type: "upload", slot: "preview", src },
  });
  expect(() => editProjectMedia(current, onEdit.mock.calls[0][0])).toThrow(
    "story_section_changed",
  );
  act(() => root.unmount());
});
