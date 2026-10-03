import assert from "node:assert/strict";
import test from "node:test";
import {
  duration,
  reducedDuration,
  sourcePose,
  endPose,
  sampleIdentity,
  sampleSurface,
  surfacePath,
  surfaceInsetEdge,
} from "../src/lib/admin-motion.ts";

const widths = [320, 390, 768, 1440];
function geometry(width) {
  return {
    header: { x: width < 641 ? 37 : 63, y: 55, scale: 0.1 },
    footer: { x: width < 641 ? 37 : 63, y: 740, scale: 0.1 },
    origin: width < 641 ? 18 : 64,
    baseline: 34,
    targetLetters: [0, 106, 210, 350, 407],
  };
}

test("identity lands before morphing, with fixed size and separate travel axes", () => {
  assert.equal(duration, 2000);
  assert.equal(reducedDuration, 160);
  for (const width of widths) {
    const g = geometry(width);
    for (const direction of [1, -1]) {
      let previous = sampleIdentity(0, g, direction);
      assert.deepEqual(
        previous.pose,
        sourcePose(direction === 1 ? g.footer : g.header),
      );
      for (let ms = 1; ms <= duration; ms++) {
        const frame = sampleIdentity(ms / duration, g, direction);
        const dx = Math.abs(frame.pose.x - previous.pose.x);
        const dy = Math.abs(frame.pose.y - previous.pose.y);
        assert.ok(dx < 1e-7 || dy < 1e-7, "the logo cannot move diagonally");
        assert.equal(
          frame.pose.scale,
          0.1,
          "native 20px identity remains the same size",
        );
        if (ms >= 700 || frame.rotation > 0)
          assert.deepEqual(frame.pose, endPose(g));
        for (const value of [
          frame.spread,
          frame.rotation,
          ...frame.min,
          frame.bracket,
          frame.native,
          frame.word,
        ]) {
          assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
        }
        if (frame.native > 0) {
          assert.equal(frame.rotation, 1);
          assert.equal(frame.bracket, 1);
          assert.ok(frame.min.every((value) => value === 1));
        }
        if (direction === 1 || ms >= 36)
          assert.ok(Math.abs(frame.native + frame.word - 1) < 1e-7);
        previous = frame;
      }
      assert.equal(previous.native, 1);
      assert.equal(previous.pX, g.targetLetters[1]);
      assert.equal(previous.blur, 0);
    }
  }
});

test("reversing during travel retains the current pose and reaches the correct endpoint", () => {
  const g = geometry(1440);
  for (const direction of [1, -1]) {
    for (const at of [0.03, 0.12, 0.24, 0.3]) {
      const old = sampleIdentity(at, g, -direction);
      const route = {
        start: at,
        end: direction === 1 ? 0.35 : 0,
        from: old.pose,
      };
      assert.deepEqual(sampleIdentity(at, g, direction, route).pose, old.pose);
      const final = sampleIdentity(route.end, g, direction, route);
      const expected = direction === 1 ? endPose(g) : sourcePose(g.header);
      for (const key of ["x", "y", "scale"])
        assert.ok(Math.abs(final.pose[key] - expected[key]) < 1e-9);
    }
  }
});

test("the surface keeps positive bounds and reaches exact native rectangles in either direction", () => {
  for (const width of widths) {
    const mobile = width < 641;
    const g = {
      card: { left: 16, top: 120, right: width - 16, bottom: 680 },
      button: { left: 32, top: 140, right: 180, bottom: 184 },
      viewport: { left: 0, top: 0, right: width, bottom: 844 },
      buttonRadii: [8, 8, 8, 8],
      main: {
        left: mobile ? 0 : 200,
        top: mobile ? 44 : 12,
        right: width,
        bottom: 844,
      },
      cardRadii: [24, 24, 24, 24],
      mainRadii: [12, 0, 0, 0],
    };
    assert.deepEqual(sampleSurface(0, g).rect, g.card);
    assert.deepEqual(sampleSurface(1, g).rect, g.viewport);
    assert.deepEqual(sampleSurface(0, g).radii, g.cardRadii);
    assert.deepEqual(sampleSurface(1, g).radii, [0, 0, 0, 0]);
    assert.deepEqual(sampleSurface(0, g).panel, g.button);
    assert.deepEqual(sampleSurface(1, g).panel, g.main);
    assert.deepEqual(sampleSurface(0, g).panelRadii, g.buttonRadii);
    assert.deepEqual(sampleSurface(1, g).panelRadii, g.mainRadii);
    // Both nested surfaces finish on the same frame, with no late edge/radius.
    for (const direction of [1, -1]) {
      const landed = sampleSurface(0.475, g, direction);
      assert.deepEqual(landed.rect, g.viewport);
      assert.deepEqual(landed.panel, g.main);
      const moving = sampleSurface(0.47, g, direction);
      assert.ok(moving.expansion < 1 && moving.panelExpansion < 1);
    }
    const topology = surfacePath(g.card, g.cardRadii).match(/[A-Z]/g).join("");
    for (const direction of [1, -1]) {
      for (let ms = 0; ms <= duration; ms++) {
        const progress = direction === 1 ? ms / duration : 1 - ms / duration;
        const frame = sampleSurface(progress, g, direction);
        assert.equal(frame.edge.left, frame.edge.right);
        assert.equal(frame.edge.top, frame.edge.bottom);
        assert.equal(
          frame.edge.top,
          frame.edge.left,
          "all corners share a clock",
        );
        assert.equal(frame.wave, 1, "the underlying blue current never fades");
        assert.ok(
          frame.panel.right > frame.panel.left &&
            frame.panel.bottom > frame.panel.top,
        );
        assert.ok(
          frame.rect.right > frame.rect.left &&
            frame.rect.bottom > frame.rect.top,
        );
        assert.ok(
          frame.radii.every((radius) => Number.isFinite(radius) && radius >= 0),
        );
        const path = surfacePath(frame.rect, frame.radii);
        assert.equal(path.match(/[A-Z]/g).join(""), topology);
        assert.ok(!path.includes("NaN") && !path.includes("Infinity"));
        for (const [key, value] of Object.entries(frame)) {
          if (typeof value === "number")
            assert.ok(value >= 0 && value <= 1, key);
        }
      }
    }
    const final = sampleSurface(1, g);
    for (const key of [
      "sidebar",
      "controls",
      "heading",
      "body",
      "action",
      "account",
    ])
      assert.equal(final[key], 1);
    for (const key of ["editorial", "nav", "footer"])
      assert.equal(final[key], 0);
  }
});

test("corner paths tolerate small and square surfaces without invalid arc commands", () => {
  for (const size of [0, 1, 8, 44]) {
    const output = surfacePath(
      { left: 0, top: 0, right: size, bottom: size },
      [100, 0, 100, 0],
    );
    assert.ok(!output.includes("NaN") && !output.includes("Infinity"));
    assert.ok(!output.includes("A"));
    const coordinates = output
      .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)
      .map(Number);
    assert.ok(coordinates.every((value) => value >= 0 && value <= size));
  }
});

test("the expanded inset keeps only its top and left outline", () => {
  const path = surfaceInsetEdge(
    { left: 200, top: 12, right: 1440, bottom: 1000 },
    [12, 0, 0, 0],
  );
  assert.ok(path.startsWith("M 200 1000 V 24 C"));
  assert.ok(path.endsWith("H 1440"));
  assert.ok(
    !path.includes("Z"),
    "the outline cannot close around bottom/right edges",
  );
});
