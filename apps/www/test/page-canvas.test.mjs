import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { syncPageCanvas } from "../src/scripts/page-canvas.ts";

function fixture({ kind = "writing", theme = "light", boundary = 400 } = {}) {
  const attributes = new Set();
  const listeners = new Map();
  const frames = new Map();
  const writes = [];
  let frameId = 0;
  let reads = 0;
  const root = {
    dataset: { theme },
    style: {},
    scrollHeight: 4000,
    classList: {
      contains: (name) => name === "writing-detail" && kind === "writing",
    },
    matches: () =>
      ["writing", "work"].includes(kind) && root.dataset.theme !== "dark",
    hasAttribute: (name) => attributes.has(name),
    toggleAttribute: (name, enabled) =>
      enabled ? attributes.add(name) : attributes.delete(name),
  };
  const meta = {
    content: "#61abea",
    getAttribute: () => meta.content,
    setAttribute: (_, color) => {
      writes.push(color);
      meta.content = color;
    },
  };
  const listen = (name, callback, options) => {
    const entries = listeners.get(name) ?? [];
    entries.push({ callback, options });
    listeners.set(name, entries);
  };
  const win = {
    scrollY: 0,
    innerHeight: 800,
    addEventListener: listen,
    requestAnimationFrame: (fn) => {
      frames.set(++frameId, fn);
      return frameId;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
    getComputedStyle: () => ({
      backgroundColor:
        root.dataset.theme === "dark"
          ? "rgb(28, 59, 96)"
          : attributes.has("data-reading-canvas")
            ? "rgb(247, 250, 255)"
            : kind === "writing"
              ? "rgb(88, 160, 228)"
              : "rgb(205, 218, 249)",
    }),
  };
  const doc = {
    defaultView: win,
    documentElement: root,
    addEventListener: listen,
    querySelector: (selector) =>
      selector.startsWith("meta")
        ? meta
        : ["writing", "work"].includes(kind)
          ? {
              getBoundingClientRect: () => {
                reads++;
                return { top: boundary, bottom: boundary };
              },
            }
          : null,
  };
  return {
    doc,
    win,
    root,
    meta,
    writes,
    frames,
    listeners,
    reading: () => attributes.has("data-reading-canvas"),
    reads: () => reads,
    boundary: (value) => {
      boundary = value;
    },
    route: (value) => {
      kind = value;
    },
    emit: (name) => listeners.get(name)?.forEach(({ callback }) => callback()),
    flush: () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn());
    },
  };
}

test("light writing top, reading, footer and return-to-top keep canvas beside the visible surface", () => {
  const f = fixture();
  syncPageCanvas(f.doc);
  assert.equal(f.meta.content, "rgb(88, 160, 228)");
  assert.equal(f.reading(), false);
  f.boundary(0);
  f.emit("scroll");
  f.flush();
  assert.equal(f.reading(), true);
  assert.equal(f.meta.content, "rgb(247, 250, 255)");
  const writes = f.writes.length;
  f.boundary(-3000);
  f.emit("scroll");
  f.flush();
  assert.equal(f.reading(), true);
  assert.equal(
    f.writes.length,
    writes,
    "footer scrolling does not rewrite unchanged theme color",
  );
  f.boundary(400);
  f.emit("scroll");
  f.flush();
  assert.equal(f.reading(), false);
  assert.equal(f.meta.content, "rgb(88, 160, 228)");
});

test("work details use the header boundary, including records without Markdown prose", () => {
  const f = fixture({ kind: "work" });
  syncPageCanvas(f.doc);
  assert.equal(f.meta.content, "rgb(205, 218, 249)");
  f.boundary(-1);
  f.emit("scroll");
  f.flush();
  assert.equal(f.reading(), true);
  assert.equal(f.meta.content, "rgb(247, 250, 255)");
});

test("short work footer matches paper before the header can leave the viewport", () => {
  const f = fixture({ kind: "work", boundary: 575.5 });
  f.root.scrollHeight = 1049.5;
  syncPageCanvas(f.doc);
  assert.equal(f.reading(), false, "initial top retains the wave canvas");
  f.win.scrollY = 249.5;
  f.boundary(326);
  f.emit("scroll");
  f.flush();
  assert.equal(f.reading(), true);
  assert.equal(f.meta.content, "rgb(247, 250, 255)");
  f.root.dataset.theme = "dark";
  f.win.__apCanvasSync();
  assert.equal(f.reading(), false);
  f.root.dataset.theme = "light";
  f.win.__apCanvasSync();
  assert.equal(f.reading(), true);
  f.win.innerHeight = 700;
  f.emit("resize");
  f.flush();
  assert.equal(
    f.reading(),
    false,
    "viewport resize no longer reaches document end",
  );
  f.win.innerHeight = 800;
  f.emit("resize");
  f.flush();
  assert.equal(f.reading(), true);
  f.win.scrollY = 0;
  f.boundary(575.5);
  f.emit("scroll");
  f.flush();
  assert.equal(f.reading(), false);
  assert.equal(f.meta.content, "rgb(205, 218, 249)");
});

test("a fitting light detail page starts on paper because its footer cannot scroll", () => {
  const f = fixture({ kind: "work", boundary: 300 });
  f.root.scrollHeight = f.win.innerHeight;
  syncPageCanvas(f.doc);
  assert.equal(f.reading(), true);
  assert.equal(f.meta.content, "rgb(247, 250, 255)");
  f.root.dataset.theme = "dark";
  f.win.__apCanvasSync();
  assert.equal(f.reading(), false);
  f.root.dataset.theme = "light";
  f.win.__apCanvasSync();
  assert.equal(f.reading(), true);
  f.route("listing");
  f.emit("astro:after-swap");
  assert.equal(
    f.reading(),
    false,
    "fitting ordinary blue routes retain their own canvas",
  );
});

test("dark and ordinary blue routes skip scroll work; theme and route swaps clear stale paper", () => {
  const f = fixture({ boundary: -100 });
  syncPageCanvas(f.doc);
  assert.equal(f.reading(), true);
  f.root.dataset.theme = "dark";
  f.win.__apCanvasSync();
  assert.equal(f.reading(), false);
  assert.equal(f.meta.content, "rgb(28, 59, 96)");
  const reads = f.reads();
  f.emit("scroll");
  assert.equal(f.frames.size, 0);
  assert.equal(f.reads(), reads);
  f.root.dataset.theme = "light";
  f.win.__apCanvasSync();
  assert.equal(f.reading(), true);
  f.route("listing");
  f.emit("astro:after-swap");
  assert.equal(f.reading(), false);
  f.emit("scroll");
  assert.equal(f.frames.size, 0);
  f.route("writing");
  f.boundary(400);
  f.emit("astro:page-load");
  assert.equal(f.reading(), false);
});

test("scroll/resize frames coalesce, pagehide cancels them and restored position synchronizes", () => {
  const f = fixture();
  syncPageCanvas(f.doc);
  syncPageCanvas(f.doc);
  assert.equal(f.listeners.get("scroll").length, 1);
  assert.equal(f.listeners.get("scroll")[0].options.passive, true);
  assert.equal(f.listeners.get("resize")[0].options.passive, true);
  const reads = f.reads();
  f.emit("scroll");
  f.emit("scroll");
  f.emit("resize");
  assert.equal(f.frames.size, 1);
  assert.equal(f.reads(), reads);
  f.emit("pagehide");
  assert.equal(f.frames.size, 0);
  f.boundary(-100);
  f.win.__apCanvasSync();
  assert.equal(
    f.reading(),
    true,
    "pageshow delegate handles browser-restored scroll",
  );
});

test("resizing across the boundary and changing theme at the footer recalculate the canvas", () => {
  const f = fixture({ boundary: -100 });
  syncPageCanvas(f.doc);
  f.boundary(20);
  f.emit("resize");
  f.flush();
  assert.equal(f.reading(), false);
  f.boundary(-2000);
  f.emit("resize");
  f.flush();
  assert.equal(f.reading(), true);
  f.root.dataset.theme = "dark";
  f.win.__apCanvasSync();
  assert.equal(f.reading(), false);
  assert.equal(f.meta.content, "rgb(28, 59, 96)");
  f.root.dataset.theme = "light";
  f.win.__apCanvasSync();
  assert.equal(f.reading(), true);
  assert.equal(f.meta.content, "rgb(247, 250, 255)");
});

test("the early Shell observer delegates theme, DOM-ready and pageshow to one canvas owner", () => {
  const shell = readFileSync(
    new URL("../src/layouts/Shell.astro", import.meta.url),
    "utf8",
  );
  const boot = shell.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
  const callbacks = {};
  let observer,
    delegated = 0;
  const root = { dataset: {}, style: {} };
  const win = {
    addEventListener: (name, fn) => {
      callbacks[name] = fn;
    },
  };
  runInNewContext(boot, {
    URL,
    location: { href: "https://anipotts.com/writing/example" },
    document: {
      cookie: "",
      documentElement: root,
      querySelector: () => null,
      addEventListener: (name, fn) => {
        callbacks[name] = fn;
      },
    },
    window: win,
    localStorage: { getItem: () => null },
    getComputedStyle: () => ({ backgroundColor: "rgb(88, 160, 228)" }),
    MutationObserver: class {
      constructor(fn) {
        observer = fn;
      }
      observe() {}
    },
  });
  win.__apCanvasSync = () => {
    delegated++;
  };
  observer();
  callbacks.DOMContentLoaded();
  callbacks.pageshow();
  win.__apThemeSync();
  assert.equal(delegated, 4);
});
