import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { builtPages, clientScripts, startTags } from "./built-html.mjs";

function element(attributes = {}, textContent = "") {
  const listeners = {};
  const values = new Map(Object.entries(attributes));
  return {
    dataset: {},
    textContent,
    title: values.get("title") ?? "",
    setAttribute: (name, value) => values.set(name, String(value)),
    getAttribute: (name) => values.get(name) ?? null,
    addEventListener: (type, listener) => (listeners[type] = listener),
    dispatch: (type, event) => listeners[type]?.(event),
    querySelector: () => null,
    querySelectorAll: () => [],
    scrollTo() {},
    focus() {},
  };
}

/** A minimal browser surface for one server-rendered image viewer. */
function fakeStage(zoomAttributes, zoomText) {
  const zoom = element(zoomAttributes, zoomText);
  const link = element();
  link.href = "/images/work/example.png";
  link.dataset.mediaAlt = "example screenshot";
  const dialog = element();
  dialog.showModal = () => {};
  dialog.close = () => {};
  const parts = {
    "[data-viewer-image]": element(),
    "[data-image-zoom]": zoom,
    "[data-image-original]": element(),
    "[data-image-description]": element(),
    ".image-viewer__canvas": element(),
  };
  dialog.querySelector = (selector) => parts[selector] ?? null;
  const stage = element();
  stage.querySelector = (selector) =>
    selector === "[data-image-viewer]" ? dialog : null;
  stage.querySelectorAll = (selector) =>
    selector === "[data-media-enlarge]" ? [link] : [];
  const open = () =>
    link.dispatch("click", {
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      preventDefault() {},
    });
  return { stage, zoom, open };
}

test("the image zoom toggle keeps its name while aria-pressed reports actual size", () => {
  const page = builtPages().find(({ html }) =>
    html.includes("data-image-zoom"),
  );
  assert.ok(page, "a built work page renders the image viewer");
  const rendered = startTags(page.html).find(
    ({ attributes }) => "data-image-zoom" in attributes,
  );
  const text = page.html.match(
    /<button\b[^>]*\bdata-image-zoom\b[^>]*>([\s\S]*?)<\/button>/,
  )?.[1];
  assert.ok(rendered && text?.trim(), "the zoom toggle has a visible name");
  const script = clientScripts(page.html).find((body) =>
    body.includes("[data-image-zoom]"),
  );
  assert.ok(script, `${page.path} ships the image viewer script`);

  const { stage, zoom, open } = fakeStage(rendered.attributes, text);
  runInNewContext(script, {
    document: {
      addEventListener() {},
      querySelectorAll: (selector) =>
        selector === "[data-project-media]" ? [stage] : [],
    },
  });
  const expectToggle = (pressed) => {
    assert.equal(zoom.getAttribute("aria-pressed"), pressed);
    assert.equal(zoom.textContent.trim(), text.trim());
    assert.equal(
      zoom.getAttribute("aria-label"),
      rendered.attributes["aria-label"] ?? null,
    );
    assert.equal(zoom.title, rendered.attributes.title ?? "");
  };

  open();
  expectToggle("false");
  zoom.dispatch("click");
  expectToggle("true");
  zoom.dispatch("click");
  expectToggle("false");
  zoom.dispatch("click");
  open();
  expectToggle("false");
});
