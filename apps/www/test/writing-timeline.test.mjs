import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIP_BOUND,
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
    ["title-out", "opacity", 0, 96, 1, 0],
    ["title-in", "opacity", 128, 64, 0, 1],
    ["summary-out", "opacity", 50, 96, 1, 0],
    ["summary-in", "opacity", 178, 64, 0, 1],
    ["date-out", "opacity", 0, 80, 1, 0],
    ["date-in", "opacity", 100, 180, 0, 1],
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
    ["ghost", "opacity", 0, 190, 1, 0],
    ["hero", "opacity", 228, 152, 0, 1],
    ["date-out", "opacity", 0, 80, 1, 0],
    ["date-in", "opacity", 250, 130, 0, 1],
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

test("outgoing text ends before incoming text starts", () => {
  for (const direction of ["open", "close"])
    for (const phone of [false, true]) {
      const stages = timeline(direction, phone);
      for (const text of ["title", "summary"]) {
        const out = find(stages, `${text}-out`, "opacity");
        const incoming = find(stages, `${text}-in`, "opacity");
        const travel = find(stages, `${text}-out`, "transform");
        assert.ok(end(out) < incoming.delay, `${direction} ${text}`);
        assert.ok(
          end(out) <= travel.delay + Math.round(travel.duration * 0.3),
          `${direction} ${text} out by 30 percent`,
        );
        assert.ok(
          incoming.delay >= travel.delay + Math.floor(travel.duration * 0.4) &&
            end(incoming) <= travel.delay + Math.ceil(travel.duration * 0.6),
          `${direction} ${text} in between 40 and 60 percent`,
        );
      }
      // Neighbouring layers never sit above 0.3 opacity in the same
      // millisecond. Opacity stages here are linear or ease-out; linear is
      // the slower fade for ease-out outgoing layers, so it bounds both.
      const opacityAt = (stage, t) => {
        const p = Math.max(0, Math.min(1, (t - stage.delay) / stage.duration));
        return stage.from + (stage.to - stage.from) * p;
      };
      const pairs = [
        ["title-out", "title-in"],
        ["summary-out", "summary-in"],
        ["summary-out", "title-in"],
        ["title-out", "summary-in"],
        ["date-out", "date-in"],
      ];
      for (const [a, b] of pairs) {
        const sa = find(stages, a, "opacity");
        const sb = find(stages, b, "opacity");
        for (let t = 0; t <= timelineEnd(stages); t++)
          assert.ok(
            opacityAt(sa, t) <= 0.3 || opacityAt(sb, t) <= 0.3,
            `${direction} phone ${phone}: ${a} and ${b} both visible at ${t} ms`,
          );
      }
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
      ["ghost", 0, 190],
      ["main", 68, 247],
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

test("every layer that travels with the surface is clip bound", () => {
  for (const direction of ["open", "close"]) {
    const moving = timeline(direction)
      .filter((s) => s.property === "transform")
      .map((s) => s.target);
    for (const target of moving) assert.ok(CLIP_BOUND.includes(target), target);
  }
  for (const target of ["surface", "ghost", "paper", "body", "hero"])
    assert.ok(!CLIP_BOUND.includes(target), target);
});
