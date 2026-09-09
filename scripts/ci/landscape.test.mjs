import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mountSharedCurrents } from "../../apps/www/src/lib/shared-currents.ts";

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
assert.ok(flow.includes("mountSharedCurrents()"));
assert.ok(flow.includes('"astro:before-swap", () => cleanup()'));
assert.ok(flow.includes('"astro:page-load"'));
assert.ok(flow.includes("import.meta.hot.dispose(() => cleanup())"));

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
  "page artwork remains static for every motion preference",
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

function harness(hostCount = 3, reduced = false) {
  const main = {};
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
      assert.equal(selector, "[data-shared-current]");
      return hosts;
    },
    querySelector(selector) {
      assert.equal(selector, "main");
      return main;
    },
  });
  const window = new Events();
  const media = Object.assign(new Events(), { matches: reduced });
  const intersections = [],
    resizes = [],
    frames = new Map();
  let clock = 0,
    frameId = 0,
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
  install("performance", { now: () => clock });
  install("matchMedia", (query) => {
    assert.equal(query, "(prefers-reduced-motion: reduce)");
    return media;
  });
  install("requestAnimationFrame", (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  install("cancelAnimationFrame", (id) => frames.delete(id));
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
    document,
    window,
    media,
    frames,
    intersections,
    resizes,
    main,
    get randomCalls() {
      return randomCalls;
    },
    step(milliseconds) {
      clock += milliseconds;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(clock);
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
    1,
    "choose one composition for the whole page",
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
    scene.frames.size,
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
  assert.equal(scene.frames.size, 0);

  scene.media.matches = false;
  scene.media.dispatch("change");
  assert.equal(scene.frames.size, 1, "one animation loop serves all cards");
  scene.step(16);
  assert.deepEqual(
    shapes(first),
    initial,
    "skip paints above the 30fps budget",
  );
  scene.step(24);
  assert.notDeepEqual(
    shapes(first),
    initial,
    "visible curves move when motion is enabled",
  );
  assert.equal(
    first.dataset.motionTime,
    "0.0200",
    "40ms advances the approved half-speed clock by 20ms",
  );
  assert.deepEqual(shapes(first), shapes(second));

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
    scene.frames.size,
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
  assert.equal(scene.frames.size, 0, "hidden tabs stop the frame loop");
  const pausedTime = Number(first.dataset.motionTime);
  scene.step(60_000);
  scene.document.hidden = false;
  scene.document.dispatch("visibilitychange");
  scene.step(40);
  assert.equal(
    Number(first.dataset.motionTime),
    pausedTime + 0.02,
    "resume without jumping through background time",
  );

  scene.media.matches = true;
  scene.media.dispatch("change");
  assert.equal(
    scene.frames.size,
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
    1,
    "resize, scroll, and visibility retain the chosen composition",
  );

  scene.media.matches = false;
  scene.media.dispatch("change");
  assert.equal(scene.frames.size, 1);
  cleanup();
  assert.equal(scene.frames.size, 0);
  assert.ok(
    scene.intersections[0].disconnected && scene.resizes[0].disconnected,
  );
  assert.equal(
    scene.document.listenerCount +
      scene.window.listenerCount +
      scene.media.listenerCount,
    0,
    "unmount removes every observer, event listener, and pending frame",
  );
  cleanup();
  const previousMount = shapes(first);
  cleanup = mountSharedCurrents();
  assert.equal(
    scene.randomCalls,
    1,
    "returning to a page preserves its composition",
  );
  assert.deepEqual(shapes(first), previousMount);
  cleanup();
  location.pathname = "/work";
  cleanup = mountSharedCurrents();
  assert.equal(
    scene.randomCalls,
    2,
    "another page chooses its own composition",
  );
  assert.notDeepEqual(shapes(first), previousMount);
  cleanup();
} finally {
  scene.restore();
}

console.log(
  "landscape: shared artwork, palettes, static fallback, motion lifecycle, and steady content passed",
);
