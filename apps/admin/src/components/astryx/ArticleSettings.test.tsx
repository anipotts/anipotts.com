// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  parseEditorialSource,
  validateEditorialSource,
} from "@anipotts/content/editorial/source";
import { AdminUIProvider } from "../workspace/AdminUI";
import { ArticleSettings } from "./ArticleSettings";

const initial =
  "---\ntitle: Example # keep\nsummary: Summary\nstatus: draft\ncustom: preserved\n---\nOriginal body.\n";
let host: HTMLDivElement;
let root: Root;
let source: string;
let changed: ReturnType<typeof vi.fn<(next: string) => void>>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  source = initial;
  changed = vi.fn<(next: string) => void>();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function show(
  disabled = false,
  errors = new Map<string, string>(),
  enabled = true,
) {
  act(() =>
    root.render(
      <AdminUIProvider enabled={enabled} mode="light">
        <ArticleSettings
          source={source}
          id="example"
          disclosure={false}
          disabled={disabled}
          errors={errors}
          onChange={(next) => {
            source = next;
            changed(next);
            show(disabled, errors, enabled);
          }}
        />
      </AdminUIProvider>,
    ),
  );
}
function input(label: string) {
  const node = [...host.querySelectorAll("label")].find(
    (node) => node.textContent === label,
  )!;
  return document.getElementById(node.htmlFor) as HTMLInputElement;
}
function type(label: string, value: string) {
  const field = input(label);
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function choose(label: string) {
  const trigger = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) =>
      document.getElementById(button.getAttribute("aria-labelledby") ?? "")
        ?.textContent === "Link type",
  )!;
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  const option = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
  ].find((node) => node.textContent === label)!;
  expect(
    option,
    `Missing ${label}: ${document.body.textContent}`,
  ).toBeDefined();
  await act(async () => {
    option.focus();
    option.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}

it("shows optional article link properties without mutating untouched source", () => {
  show();
  expect(input("Source or demo link").value).toBe("");
  expect(input("Link label").value).toBe("");
  expect(host.textContent).toContain("Not specified");
  expect(changed).not.toHaveBeenCalled();
  expect(source).toBe(initial);
});
it("round trips an authored link and label through shared inputs while preserving source", () => {
  show();
  type("Source or demo link", "/work/example");
  type("Link label", "Read ");
  expect(input("Link label").value).toBe("Read ");
  type("Link label", "Read the source");
  expect(parseEditorialSource(source).data).toMatchObject({
    artifact_url: "/work/example",
    artifact_label: "Read the source",
    custom: "preserved",
  });
  expect(source).toContain("# keep");
  expect(parseEditorialSource(source).body).toBe("Original body.\n");
  type("Source or demo link", "");
  type("Link label", "");
  expect(parseEditorialSource(source).data).not.toHaveProperty("artifact_url");
  expect(parseEditorialSource(source).data).not.toHaveProperty(
    "artifact_label",
  );
  expect(
    validateEditorialSource({ kind: "writing", id: "example" }, source).success,
  ).toBe(true);
});
it.each([
  ["Repository", "repo"],
  ["Gist", "gist"],
  ["Demo", "demo"],
  ["Screenshot", "screenshot"],
  ["Recording", "recording"],
])("saves the supported %s link type", async (label, value) => {
  show();
  await choose(label);
  expect(parseEditorialSource(source).data).toHaveProperty(
    "artifact_type",
    value,
  );
  expect(
    validateEditorialSource({ kind: "writing", id: "example" }, source).success,
  ).toBe(true);
});
it("clears a link type without removing its destination or label", async () => {
  source = initial.replace(
    "status: draft",
    "status: draft\nartifact_url: /work/example\nartifact_label: Read more\nartifact_type: demo",
  );
  show();
  await choose("Not specified");
  const data = parseEditorialSource(source).data;
  expect(data).not.toHaveProperty("artifact_type");
  expect(data).toMatchObject({
    artifact_url: "/work/example",
    artifact_label: "Read more",
  });
});
it("associates link errors with the editable field and respects a locked editor", () => {
  show(true, new Map([["artifact_url", "Use a safe destination."]]));
  const link = input("Source or demo link");
  expect(link.disabled).toBe(true);
  expect(input("Link label").disabled).toBe(true);
  expect(link.getAttribute("aria-invalid")).toBe("true");
  expect(
    document.getElementById(link.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("Use a safe destination.");
  const trigger = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) =>
      document.getElementById(button.getAttribute("aria-labelledby") ?? "")
        ?.textContent === "Link type",
  )!;
  expect(trigger.disabled).toBe(true);
  expect(changed).not.toHaveBeenCalled();
});
it("keeps the link controls available in the legacy properties surface", () => {
  show(false, new Map(), false);
  expect(input("Source or demo link").disabled).toBe(false);
  expect(input("Link label").value).toBe("");
  expect(changed).not.toHaveBeenCalled();
});
