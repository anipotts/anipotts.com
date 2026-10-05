import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
const source = readFileSync(
  new URL("../src/lib/shared-currents.ts", import.meta.url),
  "utf8",
);
function fn(name) {
  const start = source.indexOf(`  function ${name}(`);
  let depth = 0,
    end = source.indexOf("{", start);
  for (; end < source.length; end++) {
    if (source[end] === "{") depth++;
    if (source[end] === "}" && --depth === 0)
      return source.slice(start, end + 1);
  }
  throw new Error(`missing ${name}`);
}
for (const refreshRate of [60, 90, 120, 144])
  test(`${refreshRate}Hz callbacks sustain 60Hz entrance drawing`, () => {
    let now = 0,
      draws = 0,
      callback;
    const context = vm.createContext({
      performance: { now: () => now },
      pouring: () => true,
      pushed: () => 0,
      motion: () => ({ speed: 2, activeFps: 60 }),
      media: { matches: false },
      document: {
        hidden: false,
        documentElement: { hasAttribute: () => false },
      },
      visible: { size: 1 },
      draw: () => draws++,
      requestAnimationFrame: (fn) => {
        callback = fn;
        return 1;
      },
      setTimeout,
      running: () => true,
      drawBands: () => {},
      BANDS: 1000 / 15,
    });
    vm.runInContext(
      `let interval=1000/30, IDLE=1000/30, last=0, cadence=0, time=0, flow=0, timer, frame; ${fn("schedule")} ${fn("tick")} schedule();`,
      context,
    );
    for (let i = 1; i <= refreshRate; i++) {
      now = (i * 1000) / refreshRate;
      callback();
    }
    assert.equal(draws, 60);
  });
test("reduced motion settles every card and disconnects pending entrances", () => {
  const hosts = [{}, {}],
    entered = new Map();
  let stopped = 0,
    disconnected = 0,
    drawn = 0,
    still = 0;
  const context = vm.createContext({
    media: { matches: true },
    hosts,
    entered,
    stop: () => stopped++,
    arrival: { disconnect: () => disconnected++ },
    stillBands: () => still++,
    draw: (all) => {
      assert.equal(all, true);
      drawn++;
    },
    sync: () => assert.fail("must stay paused"),
  });
  vm.runInContext(
    `${fn("motionPreferenceChanged")} motionPreferenceChanged();`,
    context,
  );
  assert.equal(stopped, 1);
  assert.equal(disconnected, 1);
  assert.equal(drawn, 1);
  assert.equal(still, 1, "page bands return to their authored shapes");
  assert.deepEqual([...entered.values()], [-Infinity, -Infinity]);
});

test("offscreen scroll keeps bands at 15Hz and cards return at the current push", () => {
  let push = 8,
    frames = 0,
    wakes = 0,
    delay;
  const visible = { size: 0 };
  const context = vm.createContext({
    tick: () => {},
    performance: { now: () => 0 },
    pouring: () => true,
    pushed: () => push,
    visible,
    motion: () => ({ activeFps: 60 }),
    BANDS: 1000 / 15,
    requestAnimationFrame: () => {
      frames++;
      return 1;
    },
    setTimeout: (_, wait) => {
      wakes++;
      delay = wait;
      return 1;
    },
    sync: () => assert.fail("offscreen scroll must not restart the band timer"),
  });
  vm.runInContext(
    `let flow=0, interval, IDLE=1000/30, last=0, frame, timer;
    ${fn("schedule")} ${fn("scrolled")} schedule(); scrolled();`,
    context,
  );
  assert.equal(frames, 0);
  assert.equal(wakes, 1);
  assert.equal(delay, 1000 / 15);
  assert.equal(vm.runInContext("flow", context), push);
  push = 20;
  vm.runInContext("schedule();", context);
  assert.equal(vm.runInContext("flow", context), push);
  visible.size = 1;
  vm.runInContext("schedule();", context);
  assert.equal(frames, 1, "visible entrance resumes its 60Hz cadence");
  assert.equal(vm.runInContext("flow", context), push);
});
