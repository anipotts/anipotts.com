import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { builtPages, startTags } from "./built-html.mjs";

// Astro resolves the extensionless script import; Node needs the .ts suffix.
registerHooks({
  resolve(specifier, context, next) {
    return specifier === "./workflow-motion" &&
      context.parentURL?.endsWith("/src/scripts/workflow-animation.ts")
      ? next(`${specifier}.ts`, context)
      : next(specifier, context);
  },
});

function element(attributes = {}) {
  const listeners = {};
  const values = new Map(Object.entries(attributes));
  return {
    dataset: {},
    style: {},
    hidden: true,
    title: values.get("title") ?? "",
    setAttribute: (name, value) => values.set(name, String(value)),
    getAttribute: (name) => values.get(name) ?? null,
    addEventListener: (type, listener) => (listeners[type] = listener),
    click: () => listeners.click?.(),
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 36 }),
  };
}

/** A minimal browser surface for one server-rendered workflow figure. */
function mountFakeWorkflow(buttonAttributes) {
  const button = element(buttonAttributes);
  const source = element();
  source.cloneNode = () => element();
  const track = element();
  track.children = [source];
  track.appendChild = () => {};
  const viewport = element();
  viewport.clientWidth = 120;
  const root = element();
  root.isConnected = true;
  root.querySelector = (selector) =>
    ({
      ".source-track": track,
      ".source-window": viewport,
      "[data-motion-toggle]": button,
    })[selector];
  Object.assign(globalThis, {
    document: {
      hidden: false,
      fonts: { ready: Promise.resolve() },
      addEventListener() {},
      querySelectorAll: (selector) =>
        selector === "[data-workflow]" ? [root] : [],
    },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    getComputedStyle: () => ({ columnGap: "12px" }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: class {
      observe() {}
      disconnect() {}
    },
  });
  return button;
}

test("the motion toggle keeps its server-rendered name while paused", async () => {
  const systems = builtPages().find(({ path }) => path === "/systems.html");
  assert.ok(systems, "the systems page must be built first");
  const rendered = startTags(systems.html).find(
    ({ attributes }) => "data-motion-toggle" in attributes,
  );
  assert.ok(rendered, "the systems page renders the motion toggle");
  const { "aria-label": name, title } = rendered.attributes;
  assert.ok(name, "the motion toggle has a static name");

  const button = mountFakeWorkflow(rendered.attributes);
  const { mountWorkflows } =
    await import("../src/scripts/workflow-animation.ts");
  mountWorkflows();
  assert.equal(button.hidden, false, "motion controls appear once enhanced");

  for (const pressed of ["false", "true", "false"]) {
    assert.equal(button.getAttribute("aria-pressed"), pressed);
    assert.equal(button.getAttribute("aria-label"), name);
    assert.equal(button.title, title);
    button.click();
  }
});
