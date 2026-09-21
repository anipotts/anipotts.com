// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProjectMedia } from "./ProjectMedia";
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
