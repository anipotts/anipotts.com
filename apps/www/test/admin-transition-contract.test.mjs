import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { siteLinks } from "../../../packages/content/src/public/site.ts";

// Exercise the real click/lifecycle controller with the router as the boundary.
// Rendering geometry is covered by admin-motion.test.mjs and visual review.
const navigation = [];
const assigned = [];
let navigateResult = () => Promise.resolve();
globalThis.__adminContractNavigate = (url, options) => {
  navigation.push({ url, options });
  return navigateResult();
};
const moduleUrl = (text) => `data:text/javascript,${encodeURIComponent(text)}`;
registerHooks({
  resolve(specifier, context, next) {
    if (!context.parentURL?.endsWith("/src/scripts/admin-transitions.ts"))
      return next(specifier, context);
    if (specifier === "astro:transitions/client") {
      return {
        url: moduleUrl(
          "export const navigate = (...args) => globalThis.__adminContractNavigate(...args);",
        ),
        shortCircuit: true,
      };
    }
    if (specifier === "@anipotts/brand/theme") {
      return next(
        new URL("../../../packages/brand/src/theme.ts", import.meta.url).href,
        context,
      );
    }
    if (specifier === "./writing-ghost") {
      return {
        url: moduleUrl(
          "export function captureGhost() { throw new Error('unexpected visual capture in routing contract'); } export function prepareGhostSheets() {}",
        ),
        shortCircuit: true,
      };
    }
    if (specifier === "../lib/admin-motion")
      return next(`${specifier}.ts`, context);
    return next(specifier, context);
  },
});

class FakeElement {
  constructor(kind, target = "") {
    this.kind = kind;
    this.target = target;
  }
  closest(selector) {
    return selector.includes(`[data-admin-${this.kind}]`) ? this : null;
  }
  hasAttribute(name) {
    return name === `data-admin-${this.kind}`;
  }
}
const style = {
  visibility: "",
  removeProperty(name) {
    delete this[name];
  },
};
const document = Object.assign(new EventTarget(), {
  documentElement: { dataset: { theme: "light" } },
  body: { style, inert: false },
  querySelectorAll: () => [],
  querySelector: () => null,
  fonts: { load: () => Promise.resolve([]) },
  cookie: "",
  hidden: false,
});
const window = new EventTarget();
const media = Object.assign(new EventTarget(), { matches: false });
const location = {
  href: "https://anipotts.com/writing?tag=craft",
  pathname: "/writing",
  search: "?tag=craft",
  hostname: "anipotts.com",
  protocol: "https:",
  assign: (url) => assigned.push(url),
};
Object.assign(globalThis, {
  Element: FakeElement,
  document,
  window,
  location,
  innerWidth: 1440,
  innerHeight: 900,
  matchMedia: () => media,
  localStorage: { getItem: () => "dark" },
});
await import("../src/scripts/admin-transitions.ts");

function click(kind, modifiers = {}) {
  const event = new Event("click", { cancelable: true });
  Object.defineProperties(event, {
    target: { value: new FakeElement(kind, modifiers.target ?? "") },
    button: { value: modifiers.button ?? 0 },
    metaKey: { value: modifiers.metaKey ?? false },
    ctrlKey: { value: modifiers.ctrlKey ?? false },
    shiftKey: { value: modifiers.shiftKey ?? false },
    altKey: { value: modifiers.altKey ?? false },
  });
  document.dispatchEvent(event);
  return event;
}

test("loading and lifecycle warming never initiate admin authentication", () => {
  document.dispatchEvent(new Event("astro:page-load"));
  assert.deepEqual(navigation, []);
  assert.deepEqual(assigned, []);
  assert.equal(
    siteLinks.admin.href,
    "/admin",
    "native/no-script lock destination is the public entry",
  );
});

test("entry stays on the public origin and return retains the originating route and query", () => {
  assert.ok(click("enter").defaultPrevented);
  const entry = new URL(navigation.at(-1).url);
  assert.equal(entry.origin, "https://anipotts.com");
  assert.equal(entry.pathname, "/admin");
  assert.equal(entry.searchParams.get("theme"), "dark");
  location.href = "https://anipotts.com/admin";
  location.pathname = "/admin";
  location.search = "";
  assert.ok(click("return").defaultPrevented);
  const back = new URL(navigation.at(-1).url);
  assert.equal(back.origin, "https://anipotts.com");
  assert.equal(back.pathname, "/writing");
  assert.equal(back.searchParams.get("tag"), "craft");
});

test("modified lock clicks and the explicit auth link retain native browser navigation", () => {
  const count = navigation.length;
  for (const modifiers of [
    { metaKey: true },
    { ctrlKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
    { target: "_blank" },
  ]) {
    assert.equal(click("enter", modifiers).defaultPrevented, false);
  }
  assert.equal(
    click("action").defaultPrevented,
    false,
    "continue is a normal document link into Access",
  );
  assert.equal(navigation.length, count);
});

test("router failure falls back to the public entry rather than the protected app", async () => {
  navigateResult = () => Promise.reject(new Error("router unavailable"));
  click("enter");
  await Promise.resolve();
  assert.equal(assigned.length, 1);
  const fallback = new URL(assigned[0]);
  assert.equal(fallback.origin, "https://anipotts.com");
  assert.equal(fallback.pathname, "/admin");
  assert.equal(document.body.style.visibility, undefined);
  assert.equal(document.documentElement.dataset.adminMotion, undefined);
  navigateResult = () => Promise.resolve();
});

test("an old navigation rejection cannot redirect or tear down a newer route", async () => {
  const before = assigned.length;
  let rejectOld;
  navigateResult = () =>
    new Promise((_, reject) => {
      rejectOld = reject;
    });
  click("enter");
  navigateResult = () => Promise.resolve();
  click("return");
  document.documentElement.dataset.adminMotion = "newer-route";
  rejectOld(new Error("previous navigation failed late"));
  await Promise.resolve();
  assert.equal(
    assigned.length,
    before,
    "stale errors cannot force document navigation",
  );
  assert.equal(document.documentElement.dataset.adminMotion, "newer-route");
  window.dispatchEvent(new Event("pagehide"));
});
