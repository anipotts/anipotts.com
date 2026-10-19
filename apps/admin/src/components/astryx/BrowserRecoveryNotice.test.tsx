// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BrowserRecoveryNotice } from "./BrowserRecoveryNotice";
import { AdminUIProvider } from "../workspace/AdminUI";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("explains the save/source/re-import path and disables exhausted encrypted actions without promising a new-writing source export", async () => {
  const download = vi.fn();
  const choose = vi.fn();
  act(() =>
    root.render(
      <AdminUIProvider enabled mode="light">
        <BrowserRecoveryNotice
          problem="key-usage-limit"
          onDownload={download}
          candidates={[
            { label: "This tab", source: "synthetic input", onChoose: choose },
          ]}
        />
      </AdminUIProvider>,
    ),
  );
  expect(host.textContent).toContain(
    "Choose Create draft to save your title and address to the server before reloading",
  );
  expect(host.textContent).not.toContain("Download Markdown source");
  expect(host.textContent).toContain(
    "reload and re-import your saved recovery key",
  );
  expect(host.textContent).toContain(
    "Encrypted recovery downloads are unavailable in this document",
  );
  const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];
  expect(buttons).toHaveLength(2);
  expect(buttons.every((button) => button.disabled)).toBe(true);
  await act(async () => {
    for (const button of buttons) button.click();
  });
  expect(download).not.toHaveBeenCalled();
  expect(choose).not.toHaveBeenCalled();
  // This shared notice does not invent a plaintext download control for forms
  // such as NewWriting, whose real action is Create draft.
  expect(
    buttons.some((button) => button.textContent?.includes("Markdown")),
  ).toBe(false);
});
it("keeps normal encrypted export available for storage failures", async () => {
  const download = vi.fn();
  act(() =>
    root.render(
      <AdminUIProvider enabled mode="light">
        <BrowserRecoveryNotice problem="unavailable" onDownload={download} />
      </AdminUIProvider>,
    ),
  );
  const button = host.querySelector<HTMLButtonElement>("button")!;
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(download).toHaveBeenCalledTimes(1);
});

it("names the existing plaintext source option only when the record editor offers it", () => {
  act(() =>
    root.render(
      <AdminUIProvider enabled mode="light">
        <BrowserRecoveryNotice
          problem="key-usage-limit"
          hasPlaintextSourceDownload
        />
      </AdminUIProvider>,
    ),
  );
  expect(host.textContent).toContain(
    "Save your draft to the server, or choose Download Markdown source (plaintext)",
  );
  expect(host.textContent).not.toContain("Choose Create draft");
});
