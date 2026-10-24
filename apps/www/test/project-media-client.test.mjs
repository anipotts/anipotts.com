import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { mountProjectMedia } from "../src/scripts/preview-client.js";

function node(dataset = {}) {
  const listeners = new Map();
  const attributes = new Map();
  return {
    dataset,
    hidden: false,
    textContent: "",
    href: "/example.png",
    src: "",
    addEventListener(type, callback) {
      listeners.set(type, callback);
    },
    emit(type, event = {}) {
      listeners.get(type)?.(event);
    },
    setAttribute(key, value) {
      attributes.set(key, value);
    },
    scrollTo() {},
    focus() {},
    pause() {
      this.paused = true;
    },
    closest() {
      return null;
    },
  };
}

test("experience stages keep captions inside the expanded viewer for images, gifs and videos", () => {
  const source = readFileSync(
    new URL("../src/components/ProjectMediaStage.astro", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /<figcaption\b|data-media-figcaption/);
  assert.match(source, /data-media-caption=\{item.caption \?\? item.alt\}/);
  for (const kind of ["image", "gif", "video"]) {
    const stage = node();
    const trigger = node({
      mediaKind: kind,
      mediaSrc: `/example.${kind === "video" ? "mp4" : kind === "gif" ? "gif" : "png"}`,
      mediaAlt: "Accessible description",
      mediaCaption: "Detailed caption",
    });
    const image = node(),
      video = node(),
      zoom = node(),
      original = node(),
      description = node(),
      canvas = node(),
      dialog = node();
    let opens = 0;
    dialog.showModal = () => {
      opens++;
    };
    const parts = {
      "[data-viewer-image]": image,
      "[data-viewer-video]": video,
      "[data-image-zoom]": zoom,
      "[data-image-original]": original,
      "[data-image-description]": description,
      ".image-viewer__canvas": canvas,
    };
    dialog.querySelector = (key) => parts[key] ?? null;
    stage.querySelector = (key) =>
      key === "[data-image-viewer]" ? dialog : null;
    stage.querySelectorAll = (key) =>
      key === "[data-media-enlarge]" ? [trigger] : [];
    const previous = globalThis.document;
    globalThis.document = { querySelectorAll: () => [stage] };
    try {
      mountProjectMedia();
    } finally {
      globalThis.document = previous;
    }
    assert.equal(description.textContent, "");
    trigger.emit("click", { preventDefault() {} });
    assert.equal(opens, 1);
    assert.equal(description.textContent, "Detailed caption");
    assert.equal(image.alt, "Accessible description");
    assert.equal(image.hidden, kind === "video");
    assert.equal(video.hidden, kind !== "video");
    assert.equal(zoom.hidden, kind === "video");
    assert.equal(original.href, trigger.dataset.mediaSrc);
    video.paused = false;
    dialog.emit("close");
    assert.equal(video.paused, true);
  }
});

test("the public focus policy overrides colored rings while preserving keyboard and forced-color feedback", () => {
  const css = readFileSync(
    new URL("../src/styles/focus.css", import.meta.url),
    "utf8",
  );
  const shell = readFileSync(
    new URL("../src/layouts/Shell.astro", import.meta.url),
    "utf8",
  );
  assert.match(shell, /import "\.\.\/styles\/focus.css"/);
  assert.match(css, /outline: none !important/);
  assert.match(css, /box-shadow: none !important/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /text-decoration: underline/);
  assert.match(css, /forced-colors: active/);
});
