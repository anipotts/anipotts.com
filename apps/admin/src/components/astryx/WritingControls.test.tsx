// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminUIProvider } from "../workspace/AdminUI";
import {
  Button,
  TextInput,
  TextArea,
  ToggleButton,
  ToggleButtonGroup,
  Selector,
  IconButton,
  Banner,
} from "./WritingControls";
import { SaveStatus } from "./SaveStatus";

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
function show(children: React.ReactNode, enabled = true) {
  act(() =>
    root.render(
      <AdminUIProvider enabled={enabled} mode="light">
        {children}
      </AdminUIProvider>,
    ),
  );
}
it("keeps current-revision persistence evidence visible and separate from publication", () => {
  show(<SaveStatus state="saved-privately" />);
  const status = host.querySelector('[role="status"]')!;
  expect(status.textContent).toBe("Saved privately");
  expect(status.querySelector(".sr-only")).toBeNull();
  show(<SaveStatus state="changed" />);
  expect(status.textContent).toBe("Unsaved changes");
  expect(status.textContent).not.toMatch(/published|live/i);
});
it("retains legacy controls outside the pilot", () => {
  show(<SaveStatus state="saved-locally" />, false);
  expect(host.querySelector(".sr-only")?.textContent).toBe("Saved locally");
  expect(host.querySelector('[data-admin-ui="openai"]')).toBeNull();
});
it("preserves grouped editor formatting commands and pressed state", () => {
  const change = vi.fn();
  show(
    <ToggleButtonGroup
      label="Text style"
      type="multiple"
      value={["bold"]}
      onChange={change}
    >
      <ToggleButton value="bold" label="Bold" />
      <ToggleButton value="italic" label="Italic" />
    </ToggleButtonGroup>,
  );
  const buttons = host.querySelectorAll("button");
  expect(buttons[0]?.getAttribute("aria-pressed")).toBe("true");
  act(() => buttons[1]!.click());
  expect(change).toHaveBeenCalledWith(["bold", "italic"]);
});
it("keeps editor inputs labelled, read-only, and error-associated", () => {
  show(
    <>
      <TextInput
        label="Article address"
        value="sample"
        isReadOnly
        status={{ type: "error", message: "Address unavailable" }}
      />
      <TextArea label="Source" value="body" isReadOnly />
    </>,
  );
  const input = host.querySelector("input")!;
  expect(host.querySelector(`label[for="${input.id}"]`)?.textContent).toBe(
    "Article address",
  );
  expect(input.readOnly).toBe(true);
  expect(
    document.getElementById(input.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("Address unavailable");
  expect(host.querySelector("textarea")?.readOnly).toBe(true);
});
it("does not submit the editor form for action controls and forwards async actions", () => {
  const click = vi.fn();
  show(
    <form>
      <Button label="Retry" clickAction={click} />
    </form>,
  );
  const button = host.querySelector("button")!;
  expect(button.type).toBe("button");
  act(() => button.click());
  expect(click).toHaveBeenCalledOnce();
});

it("opens metadata choices by keyboard and returns the chosen value", async () => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  const change = vi.fn();
  show(
    <Selector
      label="Type"
      value="article"
      options={[
        { value: "article", label: "Article" },
        { value: "note", label: "Note" },
      ]}
      onChange={change}
    />,
  );
  const trigger = host.querySelector("button")!;
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
  });
  const note = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
  ].find((node) => node.textContent === "Note")!;
  expect(note).toBeDefined();
  await act(async () => {
    note.focus();
    note.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
  expect(change).toHaveBeenCalledWith("note");
});
it("retains toolbar mouse-down prevention so editor selection is not blurred", () => {
  const down = vi.fn((event: React.MouseEvent) => event.preventDefault());
  show(<ToggleButton label="Bold" isPressed onMouseDown={down} />);
  const event = new MouseEvent("mousedown", {
    bubbles: true,
    cancelable: true,
  });
  act(() => host.querySelector("button")!.dispatchEvent(event));
  expect(down).toHaveBeenCalledOnce();
  expect(event.defaultPrevented).toBe(true);
});

it("forwards focus, blur, key and ref behavior without submitting during composition", () => {
  const ref = React.createRef<HTMLInputElement>();
  const enter = vi.fn(),
    blur = vi.fn(),
    key = vi.fn();
  show(
    <TextInput
      ref={ref}
      label="Address"
      value="article"
      onEnter={enter}
      onBlur={blur}
      onKeyDown={key}
    />,
  );
  const input = host.querySelector("input")!;
  expect(ref.current).toBe(input);
  act(() => {
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        isComposing: true,
        bubbles: true,
      }),
    );
    input.blur();
  });
  expect(key).toHaveBeenCalledOnce();
  expect(enter).not.toHaveBeenCalled();
  expect(blur).toHaveBeenCalledOnce();
});
it("blocks repeated asynchronous actions until acknowledgement", async () => {
  let finish!: () => void;
  const click = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  show(<Button label="Save" clickAction={click} />);
  const button = host.querySelector("button")!;
  act(() => {
    button.click();
    button.click();
  });
  expect(click).toHaveBeenCalledOnce();
  expect(button.disabled).toBe(true);
  await act(async () => finish());
  expect(button.disabled).toBe(false);
});

it("keeps the previous restrained corner shape for actions, links and metadata selectors", () => {
  show(
    <>
      <Button label="Save" />
      <Button label="Back" href="/content/writing" />
      <ToggleButton label="Preview" />
      <Selector label="Type" value="article" options={["article", "note"]} />
    </>,
  );
  expect(host.querySelectorAll("button, a").length).toBeGreaterThanOrEqual(4);
  expect(host.querySelector("[data-pill]")).toBeNull();
});

it("leaves Enter available to enclosing forms unless a custom handler owns it", () => {
  const enter = vi.fn();
  const key = () =>
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
  show(
    <form>
      <TextInput label="Link URL" value="https://example.com" />
    </form>,
  );
  const nativeEnter = key();
  act(() => host.querySelector("input")!.dispatchEvent(nativeEnter));
  expect(nativeEnter.defaultPrevented).toBe(false);
  show(<TextInput label="Tag" value="writing" onEnter={enter} />);
  const customEnter = key();
  act(() => host.querySelector("input")!.dispatchEvent(customEnter));
  expect(customEnter.defaultPrevented).toBe(true);
  expect(enter).toHaveBeenCalledOnce();
});

it("keeps recovery explanations and additional banner content visible", () => {
  show(
    <Banner
      title="Save failed"
      status="error"
      description="Your edits remain available. Download the draft before leaving."
    >
      <span>Retry when connected.</span>
    </Banner>,
  );
  expect(host.textContent).toContain(
    "Your edits remain available. Download the draft before leaving.",
  );
  expect(host.textContent).toContain("Retry when connected.");
});

it("preserves the separate browsing context on public icon links", () => {
  show(
    <IconButton
      label="Open on site"
      icon={<span />}
      href="https://example.com/article"
      target="_blank"
      rel="noopener noreferrer"
    />,
  );
  const link = host.querySelector("a")!;
  expect(link.target).toBe("_blank");
  expect(link.rel).toBe("noopener noreferrer");
});

it("associates field guidance and replaces it with the validation message", () => {
  const description = "Use a local image path or HTTPS URL.";
  show(<TextInput label="Image URL" value="" description={description} />);
  const help = () =>
    document.getElementById(
      host.querySelector("input")!.getAttribute("aria-describedby")!,
    )?.textContent;
  expect(help()).toBe(description);
  show(
    <TextInput
      label="Image URL"
      value=""
      description={description}
      status={{ type: "error", message: "Choose an accepted image URL." }}
    />,
  );
  expect(help()).toBe("Choose an accepted image URL.");
});

it("shows an icon-only action tooltip when focused by keyboard", async () => {
  show(
    <Button
      label="Undo"
      isIconOnly
      icon={<span />}
      tooltip="Undo last change"
    />,
  );
  await act(async () => host.querySelector("button")!.focus());
  await vi.waitFor(() =>
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(
      "Undo last change",
    ),
  );
});
