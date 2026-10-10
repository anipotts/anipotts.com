import { jsonResponse } from "../../lib/test-json-response";
// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EditorialRecord } from "@anipotts/content/editorial/source";
import { AdminUIProvider } from "../workspace/AdminUI";
import { HomeEditor } from "./HomeEditor";
import { parseEditorialSource } from "@anipotts/content/editorial/source";
import { newWritingSource } from "../../lib/writing-draft";

vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => () => {} }));
vi.mock("./SavedArticlePreview", () => ({
  SavedArticlePreview: () => <p>Preview</p>,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const workSource = `---
title: Synthetic project
subtitle: A synthetic subtitle
description: A synthetic description.
year: "2026"
category: ai
role: Builder
duration: 2026
status: active
kind: project
card_copy: A synthetic card
---
`;
let root: Root;
let host: HTMLDivElement;
function snapshot(source: string) {
  const draft = {
    key: "synthetic",
    source,
    revision: 1,
    updatedAt: 1,
    discardedAt: null,
    baseCommit: "a".repeat(40),
    baseFileHash: null,
  };
  return {
    base: { source, baseCommit: draft.baseCommit, baseFileHash: null },
    draft,
    history: [draft],
    publication: null,
    publishing: "not_configured",
  };
}
beforeEach(() => {
  vi.stubGlobal("React", React);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({
      matches: false,
      media,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([
  [
    "writing",
    { kind: "writing", id: "test" },
    `${newWritingSource("Synthetic title").replace('summary: ""', 'summary: "Synthetic summary"')}Synthetic body.`,
    ["Subtitle"],
  ],
  [
    "work",
    { kind: "work", id: "test" },
    workSource,
    ["Subtitle", "Card copy", "Description"],
  ],
] as [string, EditorialRecord, string, string[]][])(
  "the %s record editor never references an empty description",
  async (_kind, record, source, rich) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("/csrf")
          ? jsonResponse(JSON.stringify({ csrf: "test-only" }))
          : jsonResponse(JSON.stringify(snapshot(source))),
      ),
    );
    window.history.replaceState(null, "", `/content/${record.kind}/test`);
    await act(async () => {
      root.render(
        <AdminUIProvider enabled={record.kind === "writing"} mode="light">
          <HomeEditor record={record} />
        </AdminUIProvider>,
      );
    });
    await act(async () => {
      await vi.waitFor(
        () =>
          expect(
            rich.map((label) =>
              host.querySelector(
                `[contenteditable][role="textbox"][aria-label="${label}"]`,
              ),
            ),
          ).not.toContain(null),
        { timeout: 2000 },
      );
    });
    const empty = [...host.querySelectorAll("[aria-describedby]")].filter(
      (element) => !element.getAttribute("aria-describedby")?.trim(),
    );
    expect(empty.map((element) => element.outerHTML.slice(0, 120))).toEqual([]);
    // A described field still points at text that exists.
    for (const element of host.querySelectorAll("[aria-describedby]"))
      for (const id of element.getAttribute("aria-describedby")!.split(" "))
        expect(document.getElementById(id), id).not.toBeNull();
  },
);

const homeSource = `---
sections:
  intro: { visible: true, label: Intro, heading: Hello, subheading: Synthetic summary }
  past_work: { visible: true, label: Work, heading: Work }
  latest_thoughts:
    visible: true
    label: Writing
    heading: Writing
    writing_slugs: [first, second]
section_order: [intro, past_work, latest_thoughts]
mentions: {}
custom: retained
---
Synthetic body.
`;

it("saves homepage selection changes through the existing editor without replacing other fields", async () => {
  let saved = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("/csrf"))
        return jsonResponse(JSON.stringify({ csrf: "test" }));
      if (url.includes("/save?")) {
        saved = JSON.parse(String(options?.body)).source;
        return jsonResponse(
          JSON.stringify({
            ok: true,
            draft: { ...snapshot(saved).draft, revision: 2 },
          }),
        );
      }
      return jsonResponse(JSON.stringify(snapshot(homeSource)));
    }),
  );
  window.history.replaceState(null, "", "/content/home/home");
  await act(async () =>
    root.render(
      <HomeEditor
        record={{ kind: "page", id: "home" }}
        homepageWritingOptions={[
          { slug: "first", title: "First", status: "published" },
          { slug: "second", title: "Second", status: "published" },
        ]}
      />,
    ),
  );
  await act(async () => {
    await vi.waitFor(() =>
      expect(
        host.querySelector('[aria-label="Remove selection 1"]'),
      ).not.toBeNull(),
    );
    (
      host.querySelector(
        '[aria-label="Remove selection 1"]',
      ) as HTMLButtonElement
    ).click();
  });
  await act(async () => {
    await vi.waitFor(() => expect(saved).toContain("second"), {
      timeout: 3000,
    });
  });
  expect(saved).not.toContain("first");
  expect(saved).toContain("custom: retained");
  expect(saved).toContain("Synthetic body.");
});

it("retains malformed homepage selections instead of exposing destructive replacement controls", async () => {
  const source = homeSource.replace(
    "writing_slugs: [first, second]",
    "writing_slugs: null",
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse(JSON.stringify(snapshot(source)))),
  );
  await act(async () =>
    root.render(<HomeEditor record={{ kind: "page", id: "home" }} />),
  );
  await act(async () => {
    await vi.waitFor(() =>
      expect(host.textContent).toContain(
        "Homepage article selection needs repair",
      ),
    );
  });
  expect(host.querySelector('[aria-label="Add article"]')).toBeNull();
});

it("opens project properties directly from an invalid draft warning", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      jsonResponse(
        JSON.stringify(
          url.includes("/csrf") ? { csrf: "test-only" } : snapshot(workSource),
        ),
      ),
    ),
  );
  window.history.replaceState(null, "", "/content/projects/test");
  await act(async () => {
    root.render(<HomeEditor record={{ kind: "work", id: "test" }} />);
  });
  expect(host.textContent).not.toContain("article settings");
  const check = Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Check properties"),
  );
  expect(check).toBeTruthy();
  await act(async () => {
    check!.click();
  });
  expect(document.body.textContent).toContain("Category");
  expect(document.body.textContent).toContain("Role");
});

it("removes a project section beside its heading while preserving other sections and unknown content", async () => {
  const source = workSource.replace(
    "card_copy: A synthetic card",
    `card_copy: A synthetic card
story:
  - title: Remove this test section
    paragraphs: [A test paragraph]
  - title: Keep this section
    paragraphs: [Keep this paragraph]
technical:
  - title: Technical evidence
    content: Keep the technical context
custom: retained`,
  );
  let saved = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("/csrf"))
        return jsonResponse(JSON.stringify({ csrf: "test" }));
      if (url.includes("/save?")) {
        saved = JSON.parse(String(options?.body)).source;
        return jsonResponse(
          JSON.stringify({
            ok: true,
            draft: { ...snapshot(saved).draft, revision: 2 },
          }),
        );
      }
      return jsonResponse(JSON.stringify(snapshot(source)));
    }),
  );
  window.history.replaceState(null, "", "/content/projects/test");
  await act(async () =>
    root.render(<HomeEditor record={{ kind: "work", id: "test" }} />),
  );
  const remove = host.querySelector<HTMLButtonElement>(
    'button[aria-label="Remove story section 1"]',
  )!;
  expect(remove).not.toBeNull();
  expect(
    host.querySelector('button[aria-label="Remove technical section 1"]'),
  ).not.toBeNull();
  await act(async () => remove.click());
  await act(async () => {
    await vi.waitFor(() => expect(saved).not.toBe(""), { timeout: 3000 });
  });
  const data = parseEditorialSource(saved).data as Record<string, any>;
  expect(data.story).toEqual([
    { title: "Keep this section", paragraphs: ["Keep this paragraph"] },
  ]);
  expect(data.technical).toEqual([
    { title: "Technical evidence", content: "Keep the technical context" },
  ]);
  expect(data.custom).toBe("retained");
  expect(data.title).toBe("Synthetic project");
});

it("shows shared defaults without changing source and saves a settings edit in the home draft", async () => {
  let saved = "";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (url.includes("/csrf"))
        return jsonResponse(JSON.stringify({ csrf: "test" }));
      if (url.includes("/save?")) {
        saved = JSON.parse(String(options?.body)).source;
        return jsonResponse(
          JSON.stringify({
            ok: true,
            draft: { ...snapshot(saved).draft, revision: 2 },
          }),
        );
      }
      return jsonResponse(JSON.stringify(snapshot(homeSource)));
    }),
  );
  window.history.replaceState(null, "", "/content/home/home");
  await act(async () =>
    root.render(<HomeEditor record={{ kind: "page", id: "home" }} />),
  );
  const field = (text: string) => {
    const label = Array.from(host.querySelectorAll("label")).find(
      (label) => label.textContent === text,
    );
    expect(label, text).toBeDefined();
    return document.getElementById(label!.htmlFor) as HTMLTextAreaElement;
  };
  await act(async () => {
    await vi.waitFor(() =>
      expect(host.textContent).toContain("Shared navigation"),
    );
  });
  expect(field("Work navigation label").value).toBe("work");
  expect(field("Footer prompt").value).toBe("have a question?");
  expect(saved).toBe("");
  await act(async () => {
    const input = field("Work navigation label");
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(input, "Synthetic projects");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    await vi.waitFor(() => expect(saved).toContain("Synthetic projects"), {
      timeout: 3000,
    });
  });
  const metadata = parseEditorialSource(saved).data as Record<string, unknown>;
  expect(metadata.site_settings).toEqual({
    navigation: { work: "Synthetic projects" },
  });
  expect(saved).toContain("custom: retained");
  expect(saved).toContain("Synthetic body.");
});
