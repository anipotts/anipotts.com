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
  const properties = new Map();
  return {
    dataset: {},
    style: {
      properties,
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: (name) => properties.delete(name),
      getPropertyValue: (name) => properties.get(name) ?? "",
    },
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
  mountFakeWorkflow.root = root;
  mountFakeWorkflow.track = track;
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
    requestAnimationFrame: () => {
      throw new Error("the marquee must not schedule animation frames");
    },
    cancelAnimationFrame() {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    IntersectionObserver: class {
      constructor(callback) {
        this.callback = callback;
      }
      observe() {
        this.callback([{ isIntersecting: true }]);
      }
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
  // A fixed "Pause" tooltip would contradict the play glyph shown while paused.
  assert.equal(title, undefined, "the motion toggle carries no title");

  const button = mountFakeWorkflow(rendered.attributes);
  const { mountWorkflows } =
    await import("../src/scripts/workflow-animation.ts");
  mountWorkflows();
  assert.equal(button.hidden, false, "motion controls appear once enhanced");

  const { root, track } = mountFakeWorkflow;
  // One source 36px wide plus a 12px gap: 48px travelled at 20px per second.
  assert.equal(track.style.properties.get("--source-cycle"), "48px");
  assert.equal(track.style.properties.get("--source-cycle-duration"), "2.4s");

  for (const [pressed, motion] of [
    ["false", "running"],
    ["true", "paused"],
    ["false", "running"],
  ]) {
    assert.equal(button.getAttribute("aria-pressed"), pressed);
    assert.equal(button.getAttribute("aria-label"), name);
    assert.equal(button.title, "");
    assert.equal(
      root.dataset.motion,
      motion,
      "the pause state the keyframe reads follows the button",
    );
    button.click();
  }
});
