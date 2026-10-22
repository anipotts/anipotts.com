// @vitest-environment jsdom
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AdminUIProvider } from "./AdminUI";
import * as controls from "./WorkspaceControls";
import * as compatibility from "../astryx/WritingControls";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false,
    media,
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
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("keeps existing editor imports on the same kit control implementations", () => {
  for (const name of Object.keys(compatibility) as Array<
    keyof typeof compatibility
  >)
    expect(compatibility[name]).toBe(controls[name]);
});
it.each([false, true])(
  "preserves the native file picker, ref and FileList (workspace pilot=%s)",
  (enabled) => {
    const ref = createRef<HTMLInputElement>();
    const onChange = vi.fn();
    const render = (disabled: boolean) =>
      act(() =>
        root.render(
          <AdminUIProvider enabled={enabled} mode="light">
            <controls.FileInput
              label="Supplied file"
              ref={ref}
              accept="application/json,.json"
              disabled={disabled}
              onChange={(event) => onChange(event.currentTarget.files)}
            />
          </AdminUIProvider>,
        ),
      );
    render(true);
    const input = ref.current!;
    expect(input.type).toBe("file");
    expect(input.accept).toBe("application/json,.json");
    expect(input.disabled).toBe(true);
    expect(input.labels?.[0]?.textContent).toBe("Supplied file");
    expect(Boolean(host.querySelector(".writing-control-field"))).toBe(enabled);
    render(false);
    expect(ref.current).toBe(input);
    expect(input.disabled).toBe(false);
    const supplied = new File(["synthetic"], "supplied.json", {
      type: "application/json",
    });
    const files = [supplied];
    Object.defineProperty(input, "files", { configurable: true, value: files });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(files);
    input.value = "";
    expect(ref.current?.value).toBe("");
  },
);

it.each([false, true])(
  "preserves field control and container styling, refs and edits (workspace pilot=%s)",
  (enabled) => {
    const inputRef = createRef<HTMLInputElement>();
    const areaRef = createRef<HTMLTextAreaElement>();
    const changed = vi.fn();
    act(() =>
      root.render(
        <AdminUIProvider enabled={enabled} mode="light">
          <controls.TextInput
            label="Address"
            value="sample"
            ref={inputRef}
            onChange={changed}
            containerClassName="address-field"
            containerStyle={{ marginTop: "3px" }}
            controlClassName="address-control"
            controlStyle={{ color: "rgb(1, 2, 3)" }}
          />
          <controls.TextArea
            label="Body"
            value="Exact body"
            ref={areaRef}
            onChange={changed}
            containerClassName="body-field"
            containerStyle={{ marginTop: "5px" }}
            controlClassName="body-control"
            controlStyle={{ color: "rgb(4, 5, 6)" }}
          />
        </AdminUIProvider>,
      ),
    );
    for (const [field, container, control, color, margin] of [
      [
        inputRef.current!,
        "address-field",
        "address-control",
        "rgb(1, 2, 3)",
        "3px",
      ],
      [areaRef.current!, "body-field", "body-control", "rgb(4, 5, 6)", "5px"],
    ] as const) {
      expect(field.closest(`.${container}`)?.getAttribute("style")).toContain(
        `margin-top: ${margin}`,
      );
      const box = field.closest<HTMLElement>(`.${control}`)!;
      expect(box).not.toBeNull();
      // Core paints the control box; SDK Input puts its native style on
      // the input inside that box. Both retain the requested text color.
      expect(field.style.color || box.style.color).toBe(color);
      expect(field.labels?.[0]?.textContent).toBe(
        field === inputRef.current ? "Address" : "Body",
      );
    }
    const field = inputRef.current!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(field, "edited");
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(changed).toHaveBeenCalledWith("edited", expect.anything());
  },
);
it.each([false, true])(
  "leaves announcement intent with the caller (workspace pilot=%s)",
  (enabled) => {
    const render = (role?: "alert" | "status") =>
      act(() =>
        root.render(
          <AdminUIProvider enabled={enabled} mode="light">
            <controls.Banner
              status="warning"
              role={role}
              title="Save needs attention"
            />
          </AdminUIProvider>,
        ),
      );
    render();
    expect(host.querySelector('[role="alert"],[role="status"]')).toBeNull();
    render("alert");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Save needs attention",
    );
    render("status");
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Save needs attention",
    );
  },
);

it.each([false, true])(
  "preserves selector control/container styling (workspace pilot=%s)",
  (enabled) => {
    act(() =>
      root.render(
        <AdminUIProvider enabled={enabled} mode="light">
          <controls.Selector
            label="Type"
            value="article"
            options={[{ value: "article", label: "Article" }]}
            onChange={() => {}}
            containerClassName="type-field"
            containerStyle={{ marginTop: "3px" }}
            controlClassName="type-control"
            controlStyle={{ color: "rgb(1, 2, 3)" }}
          />
        </AdminUIProvider>,
      ),
    );
    const box = host.querySelector<HTMLElement>(".type-control")!;
    expect(box.textContent).toContain("Article");
    expect(box.style.color).toBe("rgb(1, 2, 3)");
    expect(box.closest<HTMLElement>(".type-field")?.style.marginTop).toBe(
      "3px",
    );
  },
);

it.each([false, true])(
  "preserves a button's short visible child and full accessible label without duplicating text (workspace pilot=%s)",
  (enabled) => {
    act(() =>
      root.render(
        <AdminUIProvider enabled={enabled}>
          <controls.Button label="Remove story 1 paragraph 2">
            Remove paragraph
          </controls.Button>
          <controls.Button
            label="Open full project"
            href="/content/projects/synthetic"
          >
            Open project
          </controls.Button>
        </AdminUIProvider>,
      ),
    );
    const button = host.querySelector(
      'button[aria-label="Remove story 1 paragraph 2"]',
    );
    expect(button?.textContent).toBe("Remove paragraph");
    const link = host.querySelector('a[aria-label="Open full project"]');
    expect(link?.textContent).toBe("Open project");
  },
);

it("guards an async action until its real completion and preserves disabled state", async () => {
  let finish!: () => void;
  const action = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  act(() =>
    root.render(
      <AdminUIProvider enabled>
        <controls.Button label="Save synthetic" clickAction={action} />
      </AdminUIProvider>,
    ),
  );
  const button = host.querySelector<HTMLButtonElement>("button")!;
  await act(async () => {
    button.click();
    button.click();
  });
  expect(action).toHaveBeenCalledOnce();
  expect(button.disabled).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
  await act(async () => finish());
  expect(button.disabled).toBe(false);
  act(() =>
    root.render(
      <AdminUIProvider enabled>
        <controls.Button
          label="Save synthetic"
          isDisabled
          clickAction={action}
        />
      </AdminUIProvider>,
    ),
  );
  act(() => button.click());
  expect(action).toHaveBeenCalledOnce();
});

it("composes menu trigger callbacks, preserves refs and respects caller cancellation", async () => {
  const ref = createRef<HTMLButtonElement>();
  const focus = vi.fn();
  const pointer = vi.fn((event: React.PointerEvent<HTMLButtonElement>) =>
    event.preventDefault(),
  );
  const context = vi.fn((event: React.MouseEvent<HTMLButtonElement>) =>
    event.preventDefault(),
  );
  const capture = vi.fn((event: React.MouseEvent<HTMLButtonElement>) =>
    event.preventDefault(),
  );
  const open = vi.fn();
  act(() =>
    root.render(
      <AdminUIProvider enabled>
        <controls.DropdownMenu
          alignment="end"
          onOpenChange={open}
          button={{
            label: "Synthetic actions",
            ref,
            onFocus: focus,
            onPointerDown: pointer,
            onContextMenu: context,
            onClickCapture: capture,
          }}
          items={[{ label: "Synthetic choice", onClick: vi.fn() }]}
        />
      </AdminUIProvider>,
    ),
  );
  const trigger = ref.current!;
  expect(trigger).toBe(host.querySelector("button"));
  await act(async () => trigger.focus());
  expect(focus).toHaveBeenCalledOnce();
  for (const [type, callback] of [
    ["pointerdown", pointer],
    ["contextmenu", context],
    ["click", capture],
  ] as const) {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true });
    await act(async () => trigger.dispatchEvent(event));
    expect(callback).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(open).not.toHaveBeenCalled();
  }
  await act(async () =>
    trigger.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(open).toHaveBeenCalledWith(true);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  expect(
    document
      .getElementById(trigger.getAttribute("aria-controls")!)
      ?.getAttribute("role"),
  ).toBe("menu");
});
