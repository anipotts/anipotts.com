import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const nav = readFileSync("apps/www/src/components/Nav.astro", "utf8");
const script = nav.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
const key = "ap-hover-continuity";
const previous = { x: 30, y: 30, width: 1440, height: 950, time: Date.now() };
function boot(
  saved = previous,
  fine = true,
  blockedStorage = false,
  navigation = "navigate",
) {
  const attrs = new Set();
  const handlers = {};
  const stored = new Map([[key, JSON.stringify(saved)]]);
  const listen = (target) => (name, fn) => {
    handlers[`${target}:${name}`] = fn;
  };
  const mark = {
    getBoundingClientRect: () => ({ left: 10, right: 74, top: 10, bottom: 74 }),
    setAttribute: (name) => attrs.add(name),
    removeAttribute: (name) => attrs.delete(name),
    matches: () => false,
    addEventListener: listen("mark"),
  };
  runInNewContext(script, {
    document: {
      querySelector: () => mark,
      addEventListener: listen("document"),
    },
    window: { addEventListener: listen("window") },
    matchMedia: () => ({ matches: fine, addEventListener: listen("media") }),
    innerWidth: 1440,
    innerHeight: 950,
    performance: { getEntriesByType: () => [{ type: navigation }] },
    sessionStorage: {
      getItem: (k) => {
        if (blockedStorage) throw new Error("blocked");
        return stored.get(k);
      },
      removeItem: (k) => stored.delete(k),
      setItem: (k, v) => stored.set(k, v),
    },
  });
  return { attrs, handlers, stored };
}
const restored = boot();
assert.ok(restored.attrs.has("data-hover-continuity"), "restore before paint");
assert.equal(
  restored.stored.has(key),
  false,
  "consume the one-navigation hint",
);
restored.handlers["window:pagehide"]();
assert.ok(
  restored.stored.has(key),
  "consecutive reload retains pointer position",
);
restored.handlers["document:pointermove"]({ clientX: 200, clientY: 100 });
assert.equal(restored.attrs.size, 0, "pointer departure releases the mark");
restored.handlers["window:pagehide"]();
assert.equal(
  JSON.parse(restored.stored.get(key)).x,
  200,
  "persist outside position so reload can start closed",
);
const embedded = boot();
assert.equal(
  embedded.handlers["window:blur"],
  undefined,
  "reload blur cannot clear hover",
);
assert.equal(
  embedded.handlers["mark:pointerleave"],
  undefined,
  "document teardown cannot clear hover",
);
embedded.handlers["document:pointermove"]({ clientX: 31, clientY: 30 });
assert.ok(
  embedded.attrs.has("data-hover-continuity"),
  "position controls state even when native hover is false",
);
const fresh = boot(null);
fresh.handlers["document:pointerdown"]({
  clientX: 30,
  clientY: 30,
  type: "pointerdown",
});
assert.ok(
  fresh.stored.has(key),
  "save before navigation without relying on pagehide",
);
assert.ok(
  boot(null, true, false, "reload").attrs.has("data-hover-continuity"),
  "unknown reload starts apart",
);
assert.equal(
  boot({ ...previous, x: 200 }, true, false, "reload").attrs.size,
  0,
  "known outside reload starts together",
);
for (const saved of [
  null,
  { ...previous, time: 0 },
  { ...previous, width: 390 },
  { ...previous, x: 200 },
]) {
  assert.equal(boot(saved).attrs.size, 0, "ignore stale or misplaced hints");
}
assert.equal(boot(previous, false).attrs.size, 0, "touch never restores hover");
assert.doesNotThrow(() => boot(previous, true, true));
const shell = readFileSync("apps/www/src/layouts/Shell.astro", "utf8");
const themeBoot = shell.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];
// Model the browser inputs used by the inline boot script. These assertions
// verify page theme state and hints, not native Safari chrome repaint behavior.
function bootTheme(
  stored,
  {
    blockedStorage = false,
    earlyBackground,
    metaPresent = true,
    palette = { light: "rgb(97, 171, 234)", dark: "rgb(8, 11, 16)" },
  } = {},
) {
  const root = { dataset: {}, style: {} };
  const meta = {
    content: "#61abea",
    writes: [],
    setAttribute(name, value) {
      assert.equal(name, "content");
      this.content = value;
      this.writes.push(value);
    },
  };
  const handlers = {};
  const observers = [];
  let background = earlyBackground;
  runInNewContext(themeBoot, {
    document: {
      documentElement: root,
      querySelector(selector) {
        assert.equal(selector, 'meta[name="theme-color"]');
        return metaPresent ? meta : null;
      },
      addEventListener(name, callback, options) {
        assert.equal(name, "DOMContentLoaded");
        assert.equal(options.once, true);
        handlers[name] = callback;
      },
    },
    window: {
      addEventListener(name, callback) {
        assert.equal(name, "pageshow");
        handlers[name] = callback;
      },
    },
    localStorage: {
      getItem(key) {
        assert.equal(key, "theme");
        if (blockedStorage) throw new Error("storage unavailable");
        return stored;
      },
    },
    getComputedStyle(element) {
      assert.equal(element, root);
      return { backgroundColor: background ?? palette[root.dataset.theme] };
    },
    MutationObserver: class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(element, options) {
        assert.equal(element, root);
        assert.equal(options.attributes, true);
        assert.deepEqual(Array.from(options.attributeFilter), ["data-theme"]);
      }
    },
  });
  assert.equal(observers.length, 1, "theme changes have one root observer");
  return {
    root,
    meta,
    palette,
    handlers,
    cssReady() {
      background = undefined;
      handlers.DOMContentLoaded();
    },
    toggle(theme) {
      root.dataset.theme = theme;
      observers[0].callback();
    },
  };
}

assert.equal(
  (shell.match(/<meta name="theme-color"/g) ?? []).length,
  1,
  "one theme hint follows the site instead of competing OS-specific hints",
);
for (const stored of ["dark", "light", "invalid", null]) {
  const state = bootTheme(stored);
  const expected = stored === "dark" ? "dark" : "light";
  assert.equal(state.root.dataset.theme, expected);
  assert.equal(state.root.style.colorScheme, expected);
  assert.equal(state.meta.content, state.palette[expected]);
  for (const next of ["dark", "light", "dark"]) {
    state.toggle(next);
    assert.equal(state.root.style.colorScheme, next);
    assert.equal(
      state.meta.content,
      state.palette[next],
      "browser hint follows each site toggle",
    );
  }
  state.meta.content = "stale cached tint";
  state.root.style.colorScheme = "light";
  state.handlers.pageshow();
  assert.equal(
    state.meta.content,
    state.palette.dark,
    "restore theme hints after back/forward cache",
  );
  assert.equal(state.root.style.colorScheme, "dark");
}
const blockedTheme = bootTheme(null, { blockedStorage: true });
assert.equal(blockedTheme.root.dataset.theme, "light");
blockedTheme.toggle("dark");
assert.equal(
  blockedTheme.meta.content,
  blockedTheme.palette.dark,
  "disabled persistence does not prevent the active theme changing",
);
for (const earlyBackground of ["transparent", "rgba(0, 0, 0, 0)", ""]) {
  const state = bootTheme("dark", { earlyBackground });
  assert.equal(
    state.meta.writes.length,
    0,
    "do not replace the browser hint with unpainted CSS",
  );
  state.cssReady();
  assert.equal(
    state.meta.content,
    state.palette.dark,
    "synchronize once page CSS is available",
  );
}
assert.doesNotThrow(() =>
  bootTheme("dark", { metaPresent: false }).toggle("light"),
);
const editorialTheme = bootTheme("light", {
  palette: { light: "rgb(255, 255, 255)", dark: "rgb(17, 21, 29)" },
});
assert.equal(editorialTheme.meta.content, editorialTheme.palette.light);
editorialTheme.toggle("dark");
assert.equal(
  editorialTheme.meta.content,
  editorialTheme.palette.dark,
  "browser hints follow computed page colors, including the editorial surface",
);
assert.ok(nav.includes("min-height: 52px"));
assert.ok(nav.includes("navToggle.focus()"));
console.log(
  "navigation: hover continuity, expiry, touch, theme lifecycle, storage fallback, and menu contracts passed",
);
