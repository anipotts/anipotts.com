import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mountSharedCurrents,
  refreshSharedCurrents,
  pauseSharedCurrents,
} from "../../apps/www/src/lib/shared-currents.ts";

// Importing the scene module must not touch the document; Shell wires it.

const component = (name) =>
  readFileSync(`apps/www/src/components/${name}.astro`, "utf8");
const flow = component("AmbientFlow");
assert.ok(flow.includes('preserveAspectRatio="xMidYMid slice"'));
assert.equal(flow.includes('preserveAspectRatio="none"'), false);
assert.ok(flow.includes('kind: "work" | "writing"'));
assert.ok(flow.includes("data-shared-current"));
assert.ok(flow.includes('aria-hidden="true"'));
assert.ok(flow.includes("pointer-events: none"));
assert.ok(/\[1, 2, 3, 3, 1, 2\]\.map/.test(flow));
assert.match(
  flow,
  /d="M[^"\n]+Z"/,
  "HTML includes filled artwork without JavaScript",
);
for (const color of [
  "#83c7f4",
  "#5c9eed",
  "#5c8bea",
  "#61abea",
  "#3e82e8",
  "#2459d8",
]) {
  assert.ok(
    flow.includes(color),
    `preserve the approved layered-blue palette: ${color}`,
  );
}
assert.match(flow, /--flow-opacity:\s*0\.64/);
assert.match(flow, /--flow-opacity:\s*0\.38/);
const shell = readFileSync("apps/www/src/layouts/Shell.astro", "utf8");
const currents = readFileSync("apps/www/src/lib/shared-currents.ts", "utf8");
assert.ok(
  shell.includes("installSharedCurrents()"),
  "every page wires the scene, including pages with only page bands",
);
assert.equal(
  flow.includes("<script"),
  false,
  "cards carry no wiring of their own",
);
assert.ok(currents.includes('"astro:before-preparation", pauseSharedCurrents'));
assert.ok(currents.includes('"astro:page-load", refreshSharedCurrents'));
assert.ok(
  currents.includes("import.meta.hot.dispose(uninstallSharedCurrents)"),
);

const page = component("PageCurrent");
assert.ok(page.includes('preserveAspectRatio="xMidYMid slice"'));
assert.match(
  page,
  /\.page-current\s*\{[^}]*position:\s*absolute/s,
  "page artwork belongs to the document, not a fixed scroll overlay",
);
assert.equal(
  /position:\s*fixed|<script|@keyframes|animation:/.test(page),
  false,
  "page artwork is static markup; only the shared scene moves it",
);
assert.ok(page.includes('aria-hidden="true"'));
assert.ok(page.includes("pointer-events: none"));
assert.equal((page.match(/<path\s/g) ?? []).length, 3);
const pageOpacities = [...page.matchAll(/opacity:\s*([\d.]+)/g)];
assert.equal(
  pageOpacities.length,
  2,
  "both themes define the page artwork balance",
);
for (const opacity of pageOpacities) {
  assert.ok(
    Number(opacity[1]) > 0 && Number(opacity[1]) <= 0.15,
    "page background stays quieter than card artwork",
  );
}
for (const name of [
  "WorkCard",
  "WritingRow",
  "ExperienceFeatureCard",
  "CodingAgentTipsCard",
]) {
  const source = component(name);
  assert.ok(source.includes("<AmbientFlow"), `${name} uses shared artwork`);
  assert.equal(
    /transform:\s*(?:translateY\(-|scale\(1\.)/.test(source),
    false,
    `${name} keeps content steady during interaction`,
  );
}

// Run the real renderer against a small DOM/observer/clock fixture. This proves
// the lifecycle and shared geometry without relying on CSS implementation names.
class Events {
  listeners = new Map();
  addEventListener(type, callback) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(callback);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, callback) {
    this.listeners.get(type)?.delete(callback);
  }
  dispatch(type) {
    for (const callback of this.listeners.get(type) ?? []) callback();
  }
  get listenerCount() {
    return [...this.listeners.values()].reduce(
      (sum, callbacks) => sum + callbacks.size,
      0,
    );
  }
}

function harness(hostCount = 3, reduced = false, bandSources = []) {
  const main = {};
  const bandPaths = bandSources.map((source) => ({
    attributes: new Map([["d", source]]),
    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    },
    setAttribute(name, value) {
      this.attributes.set(name, value);
    },
  }));
  const bandArt = bandSources.length
    ? {
        getBoundingClientRect: () => ({ width: 1280, height: 3000 }),
        querySelectorAll(selector) {
          assert.equal(selector, "path");
          return bandPaths;
        },
      }
    : null;
  const hosts = Array.from({ length: hostCount }, (_, index) => {
    const attributes = new Map();
    const paths = Array.from({ length: 6 }, () => ({
      attributes: new Map(),
      setAttribute(name, value) {
        this.attributes.set(name, value);
      },
    }));
    const svg = {
      attributes,
      getAttribute(name) {
        return attributes.get(name);
      },
      setAttribute(name, value) {
        attributes.set(name, value);
      },
      querySelectorAll(selector) {
        assert.equal(selector, "path");
        return paths;
      },
    };
    return {
      dataset: {},
      hasAttribute: () => false,
      box: {
        left: 20 + (index % 2) * 324,
        top: 100 + Math.floor(index / 2) * 224,
        width: 300,
        height: 200,
      },
      svg,
      paths,
      querySelector(selector) {
        assert.equal(selector, "svg");
        return svg;
      },
      getBoundingClientRect() {
        return {
          ...this.box,
          right: this.box.left + this.box.width,
          bottom: this.box.top + this.box.height,
        };
      },
    };
  });
  const document = Object.assign(new Events(), {
    hidden: false,
    querySelectorAll(selector) {
      assert.equal(selector, "main:not([inert]) [data-shared-current]");
      return hosts;
    },
    querySelector(selector) {
      if (selector === "body > .page-current svg") return bandArt;
      assert.equal(selector, "main");
      return main;
    },
    fonts: { ready: { then: (callback) => callback() } },
  });
  const window = Object.assign(new Events(), { scrollY: 0, innerWidth: 1280 });
  const media = Object.assign(new Events(), { matches: reduced });
  const compact = Object.assign(new Events(), { matches: false });
  const intersections = [],
    resizes = [],
    frames = new Map(),
    timers = new Map();
  let clock = 0,
    frameId = 0,
    timerId = 0,
    randomCalls = 0;
  const originals = new Map();
  function install(name, value) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const random = Math.random;
  Math.random = () => (++randomCalls * 0.173) % 1;
  install("document", document);
  install("window", window);
  install("location", { pathname: "/writing" });
  install("performance", {
    now: () => clock,
    // A reload, so the fixture starts settled instead of pouring.
    getEntriesByType: () => [{ type: "reload" }],
  });
  install("matchMedia", (query) => {
    if (query === "(max-width: 1023px)") return compact;
    assert.equal(query, "(prefers-reduced-motion: reduce)");
    return media;
  });
  install("requestAnimationFrame", (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  install("cancelAnimationFrame", (id) => frames.delete(id));
  install("setTimeout", (callback, delay = 0) => {
    timers.set(++timerId, { due: clock + delay, callback });
    return timerId;
  });
  install("clearTimeout", (id) => timers.delete(id));
  class Observer {
    targets = new Set();
    disconnected = false;
    constructor(callback) {
      this.callback = callback;
    }
    observe(target) {
      this.targets.add(target);
    }
    disconnect() {
      this.targets.clear();
      this.disconnected = true;
    }
  }
  install(
    "IntersectionObserver",
    class extends Observer {
      constructor(callback) {
        super(callback);
        intersections.push(this);
      }
    },
  );
  install(
    "ResizeObserver",
    class extends Observer {
      constructor(callback) {
        super(callback);
        resizes.push(this);
      }
    },
  );
  return {
    hosts,
    bandPaths,
    document,
    window,
    media,
    compact,
    frames,
    timers,
    get wakeups() {
      return frames.size + timers.size;
    },
    intersections,
    resizes,
    main,
    get randomCalls() {
      return randomCalls;
    },
    get framesRequested() {
      return frameId;
    },
    get wakeupsRequested() {
      return frameId + timerId;
    },
    // Advance the clock, then drain due timers and the frames they request
    // until nothing more is owed at this instant.
    step(milliseconds) {
      clock += milliseconds;
      for (let guard = 0; guard < 100; guard++) {
        const due = [...timers].filter(([, entry]) => entry.due <= clock);
        for (const [id] of due) timers.delete(id);
        for (const [, entry] of due) entry.callback();
        const pending = [...frames.values()];
        frames.clear();
        for (const callback of pending) callback(clock);
        // A frame that only re-arms itself does not owe another turn.
        if (!due.length) return;
      }
      throw new Error("the ambient loop never settled");
    },
    visibility(entries) {
      intersections.at(-1).callback(
        entries.map(([index, isIntersecting]) => ({
          target: hosts[index],
          isIntersecting,
        })),
      );
    },
    restore() {
      Math.random = random;
      for (const [name, descriptor] of originals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

const shapes = (host) => host.paths.map((path) => path.attributes.get("d"));
const empty = harness(0);
try {
  const cleanup = mountSharedCurrents();
  assert.equal(typeof cleanup, "function");
  cleanup();
  assert.equal(
    empty.frames.size + empty.intersections.length + empty.resizes.length,
    0,
  );
  assert.equal(empty.document.listenerCount + empty.window.listenerCount, 0);
} finally {
  empty.restore();
}

const scene = harness(3, true);
try {
  let cleanup = mountSharedCurrents();
  const [first, second, third] = scene.hosts;
  assert.equal(
    scene.randomCalls,
    0,
    "the route seeds one composition for the whole page",
  );
  assert.deepEqual(
    scene.hosts.map((host) => host.svg.attributes.get("viewBox")),
    ["0 0 300 200", "324 0 300 200", "0 224 300 200"],
  );
  assert.deepEqual(
    shapes(first),
    shapes(second),
    "cards crop identical document-space paths",
  );
  assert.deepEqual(shapes(first), shapes(third));
  assert.equal(
    new Set(shapes(first)).size,
    6,
    "all six filled layers are present",
  );
  for (const path of shapes(first)) {
    assert.match(path, /^M.+Z$/);
    assert.equal(/NaN|Infinity/.test(path), false);
  }
  assert.ok(
    scene.resizes[0].targets.has(scene.main),
    "track layout changes in the enclosing content",
  );
  assert.equal(
    scene.wakeups,
    0,
    "reduced motion still paints a static composition",
  );
  const initial = shapes(first);
  scene.visibility([
    [0, true],
    [1, true],
    [2, true],
  ]);
  scene.step(1000);
  assert.deepEqual(shapes(first), initial);
  assert.equal(scene.wakeups, 0);

  scene.media.matches = false;
  scene.media.dispatch("change");
  assert.equal(scene.wakeups, 1, "one animation loop serves all cards");
  scene.step(16);
  assert.deepEqual(
    shapes(first),
    initial,
    "nothing is scheduled inside the 30fps budget",
  );
  assert.equal(
    scene.framesRequested,
    0,
    "no animation frame is requested only to be skipped",
  );
  scene.step(24);
  assert.notDeepEqual(
    shapes(first),
    initial,
    "visible curves move when motion is enabled",
  );
  assert.equal(
    first.dataset.motionTime,
    "0.0880",
    "40ms advances the desktop tide clock (2.2x) by 88ms",
  );
  assert.deepEqual(shapes(first), shapes(second));
  // One wakeup per drawn frame: a second of drift costs 30, not 60.
  const requested = scene.wakeupsRequested;
  for (let i = 0; i < 60; i++) scene.step(1000 / 60);
  const perSecond = scene.wakeupsRequested - requested;
  assert.ok(
    perSecond >= 29 && perSecond <= 31,
    `one main-thread wakeup per 33ms, got ${perSecond}`,
  );
  assert.equal(scene.framesRequested, 0, "and never an animation frame");
  for (const path of shapes(first)) {
    assert.match(path, /^M[-\d. C]+L[-\d. C]+Z$/);
    assert.equal(
      /\d\.\d\d/.test(path),
      false,
      "path data is serialized with one decimal",
    );
  }

  let transitioning = true;
  scene.document.documentElement = {
    hasAttribute: () => transitioning,
  };
  const handoff = shapes(first);
  const handoffTime = first.dataset.motionTime;
  scene.step(550);
  assert.deepEqual(shapes(first), handoff, "hold the captured handoff frame");
  assert.equal(first.dataset.motionTime, handoffTime);
  transitioning = false;
  scene.step(40);
  assert.equal(
    Number(first.dataset.motionTime).toFixed(4),
    (Number(handoffTime) + 0.088).toFixed(4),
    "resume without advancing through the transition",
  );

  scene.visibility([[1, false]]);
  const offscreen = shapes(second);
  scene.step(40);
  assert.deepEqual(
    shapes(second),
    offscreen,
    "offscreen cards are not repainted",
  );
  assert.notDeepEqual(shapes(first), offscreen);
  scene.visibility([
    [0, false],
    [2, false],
  ]);
  assert.equal(
    scene.wakeups,
    0,
    "stop scheduling frames when every card is offscreen",
  );
  scene.visibility([
    [0, true],
    [1, true],
    [2, true],
  ]);
  assert.deepEqual(
    shapes(first),
    shapes(second),
    "returning cards join the shared current time",
  );

  scene.document.hidden = true;
  scene.document.dispatch("visibilitychange");
  assert.equal(scene.wakeups, 0, "hidden tabs stop the frame loop");
  const pausedTime = Number(first.dataset.motionTime);
  scene.step(60_000);
  scene.document.hidden = false;
  scene.document.dispatch("visibilitychange");
  scene.step(40);
  assert.equal(
    Number(first.dataset.motionTime).toFixed(4),
    (pausedTime + 0.088).toFixed(4),
    "resume without jumping through background time",
  );

  scene.media.matches = true;
  scene.media.dispatch("change");
  assert.equal(
    scene.wakeups,
    0,
    "changing to reduced motion cancels active animation",
  );
  const still = shapes(first);
  scene.step(1000);
  assert.deepEqual(shapes(first), still);
  scene.window.dispatch("resize");
  assert.deepEqual(
    shapes(first),
    still,
    "same-size resize preserves the composition and time",
  );
  for (const host of scene.hosts) host.box.top -= 250;
  scene.window.dispatch("resize");
  assert.deepEqual(
    shapes(first),
    still,
    "document scrolling does not recompose the artwork",
  );
  first.box.width = 280;
  scene.resizes[0].callback();
  assert.equal(
    first.svg.attributes.get("viewBox"),
    "0 0 280 200",
    "layout changes update the crop",
  );
  assert.equal(
    scene.randomCalls,
    0,
    "resize, scroll, and visibility retain the chosen composition",
  );

  scene.media.matches = false;
  scene.media.dispatch("change");
  assert.equal(scene.wakeups, 1);
  cleanup();
  assert.equal(scene.wakeups, 0);
  assert.ok(
    scene.intersections[0].disconnected && scene.resizes[0].disconnected,
  );
  assert.equal(
    scene.document.listenerCount +
      scene.window.listenerCount +
      scene.media.listenerCount +
      scene.compact.listenerCount,
    0,
    "unmount removes every observer, event listener, and pending frame",
  );
  cleanup();
  const previousMount = shapes(first);
  first.box.height += 0.5;
  transitioning = true;
  cleanup = mountSharedCurrents();
  scene.resizes.at(-1).callback();
  assert.deepEqual(
    shapes(first),
    previousMount,
    "transient swap metrics cannot recompose a returning scene",
  );
  first.box.height -= 0.5;
  transitioning = false;
  scene.document.dispatch("writing:transition-end");
  assert.equal(
    scene.randomCalls,
    0,
    "returning to a page preserves its composition",
  );
  assert.deepEqual(shapes(first), previousMount);
  cleanup();
  location.pathname = "/work";
  cleanup = mountSharedCurrents();
  assert.equal(scene.randomCalls, 0, "compositions never use Math.random");
  assert.notDeepEqual(shapes(first), previousMount);
  cleanup();
  scene.document.body = {};
  const observerCount = scene.resizes.length;
  refreshSharedCurrents();
  const stableShapes = shapes(first);
  refreshSharedCurrents();
  assert.equal(
    scene.resizes.length,
    observerCount + 1,
    "after-swap and page-load share one scene instead of remounting",
  );
  assert.deepEqual(shapes(first), stableShapes);
  pauseSharedCurrents();
  pauseSharedCurrents();
  scene.document.body = {};
  refreshSharedCurrents();
  assert.equal(scene.resizes.length, observerCount + 2);
  assert.deepEqual(
    shapes(first),
    stableShapes,
    "restored document starts with the previous composition before page-load",
  );
  pauseSharedCurrents();
} finally {
  scene.restore();
}

// The page bands drift on the cards' clock, even on a page with no cards.
const authoredBands = [...page.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
assert.equal(authoredBands.length, 3);
const bandScene = harness(0, false, authoredBands);
try {
  const cleanup = mountSharedCurrents();
  const bandShapes = () =>
    bandScene.bandPaths.map((path) => path.attributes.get("d"));
  assert.deepEqual(
    bandShapes(),
    authoredBands,
    "the first frame is the authored art",
  );
  assert.equal(bandScene.wakeups, 1, "page bands alone keep one loop");
  const requested = bandScene.wakeupsRequested;
  for (let i = 0; i < 60; i++) bandScene.step(1000 / 60);
  const perSecond = bandScene.wakeupsRequested - requested;
  // The fixture clock steps 16.7ms, so a 66.7ms timer can land a step late.
  assert.ok(
    perSecond >= 12 && perSecond <= 16,
    `a page with no cards wakes about 15 times a second, got ${perSecond}`,
  );
  assert.equal(bandScene.framesRequested, 0, "and never an animation frame");
  for (let i = 0; i < 4; i++) bandScene.step(1000);
  const drifted = bandShapes();
  assert.notDeepEqual(drifted, authoredBands, "page bands drift");
  const numbers = (d) => (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
  for (const [i, d] of drifted.entries()) {
    assert.match(d, /^M[-\d. CSLZ]+$/);
    assert.equal(/NaN|Infinity/.test(d), false);
    // Every x stays put and every y moves by at most the swell, in art units
    // (24px at a 2.5 slice scale, plus the second harmonic).
    const before = numbers(
      authoredBands[i].replace(/V(-?[\d.]+)/g, (_, y) => `L0 ${y}`),
    );
    const after = numbers(d);
    assert.equal(after.length, before.length);
    for (let k = 1; k < after.length; k += 2)
      assert.ok(Math.abs(after[k] - before[k]) <= (24 * 1.35) / 2.5 + 0.1);
  }
  bandScene.media.matches = true;
  bandScene.media.dispatch("change");
  assert.deepEqual(
    bandShapes(),
    authoredBands,
    "reduced motion returns the authored art",
  );
  assert.equal(bandScene.wakeups, 0);
  cleanup();
  assert.equal(
    bandScene.document.listenerCount +
      bandScene.window.listenerCount +
      bandScene.media.listenerCount +
      bandScene.compact.listenerCount,
    0,
  );
} finally {
  bandScene.restore();
}

console.log(
  "landscape: shared artwork, palettes, static fallback, motion lifecycle, page bands, and steady content passed",
);
