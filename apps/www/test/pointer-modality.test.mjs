import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { installPointerModality } from "../src/scripts/pointer-modality.ts";

function documentFixture() {
  const listeners = new Map();
  let attributes = new Set();
  const doc = {
    documentElement: {
      toggleAttribute: (name, enabled) =>
        enabled ? attributes.add(name) : attributes.delete(name),
    },
    addEventListener: (name, callback, options) => {
      const entries = listeners.get(name) ?? [];
      entries.push({ callback, options });
      listeners.set(name, entries);
    },
  };
  return {
    doc,
    listeners,
    touch: () => attributes.has("data-touch-input"),
    emit: (name, event = {}) =>
      listeners.get(name)?.forEach(({ callback }) => callback(event)),
    swap: () => {
      attributes = new Set();
    },
  };
}

test("touch scrolling only changes feedback; keyboard and mouse restore focus feedback", () => {
  const fixture = documentFixture();
  installPointerModality(fixture.doc);
  fixture.emit("pointerdown", { pointerType: "touch" });
  assert.equal(fixture.touch(), true);
  fixture.emit("pointermove", { pointerType: "touch" });
  assert.equal(fixture.touch(), true);
  assert.equal(fixture.listeners.has("click"), false);
  assert.equal(fixture.listeners.get("pointerdown")[0].options.passive, true);
  fixture.emit("keydown", { key: "Tab" });
  assert.equal(fixture.touch(), false);
  fixture.emit("touchstart");
  assert.equal(fixture.touch(), true);
  fixture.emit("pointermove", { pointerType: "mouse" });
  assert.equal(fixture.touch(), false);
});

test("modality survives Astro swaps without duplicate listeners", () => {
  const fixture = documentFixture();
  installPointerModality(fixture.doc);
  installPointerModality(fixture.doc);
  assert.equal(fixture.listeners.get("pointerdown").length, 1);
  fixture.emit("pointerdown", { pointerType: "touch" });
  fixture.swap();
  fixture.emit("astro:after-swap");
  assert.equal(fixture.touch(), true);
});

test("touch on a hybrid device clears restored brand hover without consuming clicks", () => {
  const nav = readFileSync(
    new URL("../src/components/Nav.astro", import.meta.url),
    "utf8",
  );
  const script = nav.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
  const attributes = new Set();
  const listeners = {};
  const stored = new Map([
    [
      "ap-hover-continuity",
      JSON.stringify({
        x: 30,
        y: 30,
        width: 1440,
        height: 950,
        time: Date.now(),
      }),
    ],
  ]);
  const mark = {
    dataset: {},
    getBoundingClientRect: () => ({ left: 10, right: 74, top: 10, bottom: 74 }),
    setAttribute: (name) => attributes.add(name),
    removeAttribute: (name) => attributes.delete(name),
  };
  runInNewContext(script, {
    document: {
      querySelector: () => mark,
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
    },
    window: { addEventListener: () => {} },
    matchMedia: () => ({ matches: true, addEventListener: () => {} }),
    innerWidth: 1440,
    innerHeight: 950,
    performance: { getEntriesByType: () => [] },
    sessionStorage: {
      getItem: (key) => stored.get(key),
      setItem: (key, value) => stored.set(key, value),
      removeItem: (key) => stored.delete(key),
    },
  });
  assert.equal(attributes.has("data-hover-restored"), true);
  listeners.pointerdown({ pointerType: "touch" });
  assert.equal(attributes.size, 0);
  assert.equal(stored.size, 0);
  assert.equal(listeners.click, undefined);
  listeners.pointermove({ pointerType: "mouse", clientX: 30, clientY: 30 });
  assert.equal(attributes.has("data-hover-continuity"), true);
});

test("touch press rings are absent and keyboard outlines remain defined", () => {
  for (const name of ["WorkCard", "ExperienceFeatureCard", "Nav"]) {
    const source = readFileSync(
      new URL(`../src/components/${name}.astro`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(source, /:active\s*\{/);
  }
  const css = readFileSync(
    new URL("../src/styles/global.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /:focus-visible\s*\{\s*outline: 2px solid var\(--focus\)/);
  assert.match(
    css,
    /html\[data-touch-input\] :where\(a, button, summary\):focus-visible/,
  );
  assert.doesNotMatch(css, /html\[data-touch-input\] :where\([^)]*input/);
});

test("persisted navigation adopts incoming publication labels and current-page state", () => {
  const source = readFileSync(
    new URL("../src/components/Nav.astro", import.meta.url),
    "utf8",
  );
  const script = stripTypeScriptTypes(
    source
      .match(/<script>([\s\S]*?)<\/script>/iu)[1]
      .replace(/^\s*import\b[\s\S]*?;/gmu, ""),
  );
  function link(href, text, current = null) {
    const attributes = new Map([
      ["href", href],
      ["data-preserved", "true"],
    ]);
    if (current) attributes.set("aria-current", current);
    return {
      textContent: text,
      getAttribute: (name) => attributes.get(name) ?? null,
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: (name) => attributes.delete(name),
    };
  }
  const links = [
    link("/work", "work", "page"),
    link("/writing", "writing"),
    link("/systems", "systems"),
  ];
  const listeners = new Map();
  const nav = { querySelectorAll: () => links, addEventListener() {} };
  const document = {
    documentElement: { dataset: {} },
    getElementById: (id) => (id === "primary-nav" ? nav : null),
    addEventListener: (name, callback) => listeners.set(name, callback),
  };
  runInNewContext(script, {
    document,
    matchMedia: () => ({ addEventListener() {} }),
    savedTheme: () => "light",
    resolvedTheme: () => "light",
    saveTheme() {},
    themedUrl: (value) => value,
  });
  const next = [
    link("/work", "Synthetic projects"),
    link("/writing", "書く ✍️", "page"),
    link("/other", "Unrelated link", "page"),
  ];
  listeners.get("astro:before-swap")({
    newDocument: { querySelectorAll: () => next },
  });
  assert.equal(links[0].textContent, "Synthetic projects");
  assert.equal(links[0].getAttribute("aria-current"), null);
  assert.equal(links[1].textContent, "書く ✍️");
  assert.equal(links[1].getAttribute("aria-current"), "page");
  assert.equal(links[2].textContent, "systems");
  assert.equal(links[2].getAttribute("aria-current"), null);
  assert.equal(links[0].getAttribute("data-preserved"), "true");
  listeners.get("astro:before-swap")({
    newDocument: {
      querySelectorAll: () => [
        link("/work", "work", "page"),
        link("/writing", "writing"),
      ],
    },
  });
  assert.equal(links[0].getAttribute("aria-current"), "page");
  assert.equal(links[1].getAttribute("aria-current"), null);
  assert.equal(links[1].textContent, "writing");
});
