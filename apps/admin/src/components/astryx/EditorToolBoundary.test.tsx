// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { EditorToolBoundary } from "./EditorToolBoundary";

it("contains optional tool failures without unmounting the draft editor", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const host = document.createElement("div");
  const root = createRoot(host);
  let unmounted = false;
  function Draft() {
    React.useEffect(
      () => () => {
        unmounted = true;
      },
      [],
    );
    return <input defaultValue="Unsaved draft" />;
  }
  function Broken(): React.ReactNode {
    throw new Error("synthetic chunk failure");
  }
  try {
    await act(async () =>
      root.render(
        <>
          <Draft />
          <EditorToolBoundary>
            <Broken />
          </EditorToolBoundary>
        </>,
      ),
    );
    expect(host.textContent).toContain("Source editor could not load");
    expect(host.textContent).not.toContain("synthetic chunk failure");
    expect(host.querySelector("input")?.value).toBe("Unsaved draft");
    expect(unmounted).toBe(false);
  } finally {
    await act(async () => root.unmount());
    error.mockRestore();
    vi.unstubAllGlobals();
  }
});
