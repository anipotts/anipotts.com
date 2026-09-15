import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIP_BOUND,
  SURFACE_CLOCK,
  CLOSE_EASE,
  OPEN_EASE,
  curveOf,
  surfaceDuration,
  timelineEnd,
  writingTimeline,
} from "../src/lib/writing-timeline.ts";

const find = (stages, target, property) =>
  stages.find((s) => s.target === target && s.property === property);
const end = (stage) => stage.delay + stage.duration;
const timeline = (direction, phone = false) =>
  writingTimeline({ direction, phone, theme: "dark" });

test("constants match the approved spec table", () => {
  const cases = [
    ["open", false, 420, 319, 50, OPEN_EASE],
    ["open", true, 357, 271, 43, OPEN_EASE],
    ["close", false, 380, 289, 0, CLOSE_EASE],
    ["close", true, 323, 245, 0, CLOSE_EASE],
  ];
  for (const [direction, phone, D, travel, stagger, ease] of cases) {
    const stages = timeline(direction, phone);
    const surface = find(stages, "surface", "clip");
    assert.equal(surface.duration, D, `${direction} ${phone} D`);
    assert.equal(surface.delay, 0);
    assert.equal(surface.easing, ease);
    assert.equal(surfaceDuration(direction, phone), D);
    assert.equal(find(stages, "title-out", "transform").duration, travel);
    assert.equal(find(stages, "summary-in", "transform").delay, stagger);
    assert.equal(find(stages, "title-in", "transform").delay, 0);
    for (const target of ["waves", "morph"])
      assert.equal(
        stages.find((s) => s.target === target).duration,
        D,
        `${target} runs with the surface`,
      );
  }
  assert.equal(OPEN_EASE, "cubic-bezier(0.16, 1, 0.3, 1)");
  assert.equal(CLOSE_EASE, "cubic-bezier(0.65, 0, 0.35, 1)");
  assert.deepEqual(curveOf(OPEN_EASE), [0.16, 1, 0.3, 1]);
  assert.deepEqual(curveOf("ease-out"), [0, 0, 0.58, 1]);
});

test("open stages follow the spec rows", () => {
  const stages = timeline("open");
  const expect = [
    ["paper", "opacity", 0, 420, 1, 0],
    ["ghost", "opacity", 0, 231, 1, 0],
    ["title-out", "opacity", 0, 159.6, 1, 0],
    ["title-in", "opacity", 63.84, 159.6, 0, 1],
    ["summary-out", "opacity", 50, 159.6, 1, 0],
    ["summary-in", "opacity", 113.84, 159.6, 0, 1],
    ["date-out", "opacity", 0, 0, 1, 0],
    ["date-in", "opacity", 100, 180, 0, 1],
    ["icon-out", "opacity", 0, 80, 1, 0],
    ["back", "opacity", 126, 210, 0, 1],
    ["body", "rise", 420, 260, 14, 0],
  ];
  for (const [target, property, delay, duration, from, to] of expect)
    assert.deepEqual(
      (({ delay, duration, from, to }) => ({ delay, duration, from, to }))(
        find(stages, target, property),
      ),
      { delay, duration, from, to },
      `${target} ${property}`,
    );
  assert.deepEqual(
    [
      find(stages, "waves", "opacity").from,
      find(stages, "waves", "opacity").to,
    ],
    [1, 0.75],
  );
  assert.equal(timelineEnd(stages), 680);
});

test("close stages follow the spec rows", () => {
  const stages = timeline("close");
  const expect = [
    ["ghost", "opacity", 0, 114, 1, 0],
    ["hero", "opacity", 228, 152, 0, 1],
    ["date-out", "opacity", 0, 80, 1, 0],
    ["date-in", "opacity", 250, 130, 0, 1],
    ["icon-in", "opacity", 250, 130, 0, 1],
    ["paper", "opacity", 152, 228, 0, 1],
  ];
  for (const [target, property, delay, duration, from, to] of expect) {
    const stage = find(stages, target, property);
    assert.deepEqual(
      [stage.delay, stage.duration, stage.from, stage.to],
      [delay, duration, from, to],
      `${target} ${property}`,
    );
  }
  assert.equal(find(stages, "body", "rise"), undefined);
  assert.equal(timelineEnd(stages), 380);
});

test("a title is painted in every frame of the crossfade", () => {
  // The two copies of one line ramp linearly over the same length, offset by
  // 0.4 of it, so their sum holds at 0.6 for the whole overlap and they cross
  // at 0.3 each. Sampled every tenth of a millisecond, finer than a frame.
  const opacityAt = (stage, t) => {
    const p = Math.max(0, Math.min(1, (t - stage.delay) / stage.duration));
    return stage.from + (stage.to - stage.from) * p;
  };
  for (const direction of ["open", "close"])
    for (const phone of [false, true]) {
      const stages = timeline(direction, phone);
      for (const text of ["title", "summary"]) {
        const out = find(stages, `${text}-out`, "opacity");
        const incoming = find(stages, `${text}-in`, "opacity");
        const travel = find(stages, `${text}-out`, "transform");
        const where = `${direction} phone ${phone} ${text}`;
        assert.equal(out.easing, "linear", where);
        assert.equal(incoming.easing, "linear", where);
        assert.equal(
          out.delay,
          travel.delay,
          `${where} starts with the travel`,
        );
        assert.ok(
          end(incoming) <= travel.delay + travel.duration,
          `${where} lands before the travel ends`,
        );
        assert.ok(
          Math.abs(out.duration - incoming.duration) < 1e-9,
          `${where} equal ramps`,
        );
        assert.ok(
          Math.abs(incoming.delay - out.delay - out.duration * 0.4) < 1e-9,
          `${where} incoming offset by 0.4 of the ramp`,
        );
        for (let t = out.delay; t <= end(incoming) + 1; t += 0.1) {
          const sum = opacityAt(out, t) + opacityAt(incoming, t);
          assert.ok(sum >= 0.6 - 1e-9, `${where}: sum ${sum} at ${t} ms`);
          assert.ok(
            opacityAt(out, t) <= 0.3 + 1e-9 ||
              opacityAt(incoming, t) <= 0.3 + 1e-9,
            `${where}: both above 0.3 at ${t} ms`,
          );
        }
      }
      // The date has no second copy in flight: one fades out in place before
      // the other fades in.
      const dateOut = find(stages, "date-out", "opacity");
      const dateIn = find(stages, "date-in", "opacity");
      for (let t = 0; t <= timelineEnd(stages); t++)
        assert.ok(
          opacityAt(dateOut, t) <= 0.3 || opacityAt(dateIn, t) <= 0.3,
          `${direction} phone ${phone}: both dates visible at ${t} ms`,
        );
    }
});

test("dates fade in place with no travel", () => {
  for (const direction of ["open", "close"])
    for (const phone of [false, true]) {
      const dates = timeline(direction, phone).filter((s) =>
        s.target.startsWith("date"),
      );
      assert.equal(dates.length, 2);
      assert.ok(dates.every((s) => s.property === "opacity"));
    }
});

test("body rise starts when the surface lands", () => {
  for (const phone of [false, true]) {
    const stages = timeline("open", phone);
    assert.equal(
      find(stages, "body", "rise").delay,
      find(stages, "surface", "clip").duration,
    );
  }
});

test("listing heading hold ends at or after 0.6 D on close", () => {
  for (const phone of [false, true]) {
    const stages = timeline("close", phone);
    const hero = find(stages, "hero", "opacity");
    const D = find(stages, "surface", "clip").duration;
    assert.ok(hero.delay >= Math.floor(0.6 * D), `phone ${phone}`);
    assert.equal(hero.from, 0);
    assert.ok(end(hero) <= D + 1);
  }
});

test("phone values are 0.85 times desktop", () => {
  for (const direction of ["open", "close", "fade"]) {
    const desktop = timeline(direction, false);
    const phone = timeline(direction, true);
    assert.equal(desktop.length, phone.length);
    desktop.forEach((stage, i) => {
      const p = phone[i];
      assert.equal(p.target, stage.target);
      assert.equal(p.property, stage.property);
      assert.ok(Math.abs(p.delay - stage.delay * 0.85) <= 1, `${stage.target}`);
      assert.ok(
        Math.abs(p.duration - stage.duration * 0.85) <= 1,
        `${stage.target} ${stage.property}`,
      );
    });
  }
});

test("reduced motion returns an empty list", () => {
  for (const direction of ["open", "close", "fade", "exit"])
    assert.deepEqual(
      writingTimeline({
        direction,
        phone: false,
        theme: "dark",
        reducedMotion: true,
      }),
      [],
    );
});

test("fade and exit keep their documented shapes", () => {
  const fade = timeline("fade");
  assert.deepEqual(
    fade.map((s) => [s.target, s.delay, s.duration]),
    [
      ["ghost", 0, 152],
      ["main", 133, 228],
    ],
  );
  const exit = timeline("exit", true);
  assert.deepEqual(
    exit.map((s) => [s.target, s.property, s.delay, s.duration]),
    [
      ["ghost", "opacity", 0, 231],
      ["main", "opacity", 99, 358],
      ["exit-waves", "slide", 0, 550],
    ],
  );
});

test("every layer that travels with the surface is clip bound or on its clock", () => {
  for (const direction of ["open", "close"]) {
    const moving = timeline(direction)
      .filter((s) => s.property === "transform")
      .map((s) => s.target);
    for (const target of moving)
      assert.ok(
        CLIP_BOUND.includes(target) !== SURFACE_CLOCK.includes(target),
        target,
      );
  }
  // The wave wrapper is drawn from the surface animation's own clock, so its
  // edges cannot run ahead of or behind the clip edge.
  assert.ok(SURFACE_CLOCK.includes("waves"));
  for (const target of ["surface", "ghost", "paper", "body", "hero"])
    assert.ok(!CLIP_BOUND.includes(target), target);
});

test("the card date leaves on the first open frame and the icon fades in place", () => {
  for (const phone of [false, true]) {
    const open = timeline("open", phone);
    assert.equal(find(open, "date-out", "opacity").duration, 0);
    const close = timeline("close", phone);
    const icons = [...open, ...close].filter((s) =>
      s.target.startsWith("icon"),
    );
    assert.equal(icons.length, 2);
    assert.ok(icons.every((s) => s.property === "opacity"));
    assert.ok(
      Math.abs(
        end(find(close, "icon-in", "opacity")) -
          find(close, "surface", "clip").duration,
      ) <= 1,
      "the icon is fully in when the card lands",
    );
  }
});

test("outgoing pages are gone before incoming text or pages pass 0.3", () => {
  const ease = (x) => {
    // ease-out, cubic-bezier(0, 0, 0.58, 1), by bisection on the curve.
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 40; i++) {
      t = (lo + hi) / 2;
      const bx = 3 * (1 - t) * t * t * 0.58 + t * t * t;
      if (bx < x) lo = t;
      else hi = t;
    }
    return 3 * (1 - t) * t * t + t * t * t;
  };
  const at = (stage, time) => {
    const p = Math.max(0, Math.min(1, (time - stage.delay) / stage.duration));
    return stage.from + (stage.to - stage.from) * ease(p);
  };
  for (const phone of [false, true]) {
    const close = timeline("close", phone);
    // The article copy is below 0.3 before the incoming card text passes it.
    // The ghost fades on ease-out, which is under the linear line for its
    // whole run, so the linear bound here is the conservative one.
    const ghost = find(close, "ghost", "opacity");
    const linear = (stage, time) => {
      const p = Math.max(0, Math.min(1, (time - stage.delay) / stage.duration));
      return stage.from + (stage.to - stage.from) * p;
    };
    for (const text of ["title-in", "summary-in"]) {
      const incoming = find(close, text, "opacity");
      for (let t = 0; t <= timelineEnd(close); t += 0.5)
        assert.ok(
          at(ghost, t) <= 0.3 || linear(incoming, t) <= 0.3,
          `phone ${phone}: ghost and ${text} both visible at ${t} ms`,
        );
    }
    const fade = timeline("fade", phone);
    const [out, main] = [
      find(fade, "ghost", "opacity"),
      find(fade, "main", "opacity"),
    ];
    for (let t = 0; t <= timelineEnd(fade); t++)
      assert.ok(
        at(out, t) <= 0.3 || at(main, t) <= 0.3,
        `phone ${phone}: both pages visible at ${t} ms`,
      );
  }
});
