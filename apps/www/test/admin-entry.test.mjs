import assert from "node:assert/strict";
import test from "node:test";

globalThis.document = new EventTarget();
const { toggleEntrySidebar } = await import("../src/scripts/admin-entry.ts");

function controls(inert = false) {
  const shell = { dataset: {}, hasAttribute: () => inert };
  const attributes = {};
  const button = {
    closest: () => shell,
    setAttribute: (key, value) => (attributes[key] = value),
  };
  return { shell, button, attributes };
}

test("sign-in sidebar collapses and expands without navigating", () => {
  const { shell, button, attributes } = controls();
  toggleEntrySidebar(button);
  assert.equal(shell.dataset.sidebarCollapsed, "true");
  assert.equal(attributes["aria-expanded"], "false");
  assert.equal(
    attributes["aria-label"],
    undefined,
    "the control keeps its static name",
  );
  toggleEntrySidebar(button);
  assert.equal(shell.dataset.sidebarCollapsed, "false");
  assert.equal(attributes["aria-expanded"], "true");
  assert.equal(button.title, undefined, "the control keeps its static tooltip");
});

test("transition previews remain inert", () => {
  const { shell, button, attributes } = controls(true);
  toggleEntrySidebar(button);
  assert.deepEqual(shell.dataset, {});
  assert.deepEqual(attributes, {});
});
