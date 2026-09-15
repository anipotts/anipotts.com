import assert from "node:assert/strict";
import test from "node:test";
import { builtPages } from "./built-html.mjs";
import {
  contourColumns,
  flattenPath,
  waveContour,
} from "../src/lib/wave-geometry.ts";

// An independent reference: absolute M, L, H, V, C, Z only, sampled far more
// densely than the module does, so a flattening mistake cannot hide.
function reference(d) {
  const tokens = d.match(/[MLHVCZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g);
  const points = [];
  let i = 0;
  let command = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const n = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Z]/.test(tokens[i])) {
      command = tokens[i++];
      if (command === "Z") {
        points.push({ x: startX, y: startY });
        x = startX;
        y = startY;
        continue;
      }
    }
    if (command === "M") {
      x = startX = n();
      y = startY = n();
      points.push({ x, y });
      command = "L";
    } else if (command === "L") {
      x = n();
      y = n();
      points.push({ x, y });
    } else if (command === "H") {
      x = n();
      points.push({ x, y });
    } else if (command === "V") {
      y = n();
      points.push({ x, y });
    } else if (command === "C") {
      const [x1, y1, x2, y2, x3, y3] = [n(), n(), n(), n(), n(), n()];
      for (let k = 1; k <= 2048; k++) {
        const t = k / 2048;
        const u = 1 - t;
        points.push({
          x: u ** 3 * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t ** 3 * x3,
          y: u ** 3 * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t ** 3 * y3,
        });
      }
      x = x3;
      y = y3;
    } else throw new Error(`reference cannot read ${command}`);
  }
  return points;
}

function maxDifference(a, b) {
  let worst = 0;
  a.forEach((column, i) => {
    assert.equal(column.x, b[i].x);
    worst = Math.max(
      worst,
      Math.abs(column.top - b[i].top),
      Math.abs(column.bottom - b[i].bottom),
    );
  });
  return worst;
}

function headerWaves() {
  const waves = [];
  for (const page of builtPages()) {
    const block = page.html.match(
      /class="detail-waves[^"]*"[^>]*>\s*<svg[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/svg>/,
    );
    if (!block) continue;
    const [x, y, width, height] = block[1].split(/[\s,]+/).map(Number);
    for (const [, d] of block[2].matchAll(/\sd="([^"]+)"/g))
      waves.push({ page: page.path, box: { x, y, width, height }, d });
  }
  return waves;
}

// Same construction shared-currents.ts uses for card currents: a Catmull-Rom
// style cubic run along the top, a line down, the bottom run back, close.
function cardCurrent(width, height, phase) {
  const curve = (points, move) => {
    let d = move ? `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}` : "";
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[Math.max(0, i - 1)];
      const b = points[i];
      const c = points[i + 1];
      const z = points[Math.min(points.length - 1, i + 2)];
      d += `C${(b.x + (c.x - a.x) / 6).toFixed(2)} ${(b.y + (c.y - a.y) / 6).toFixed(2)} ${(c.x - (z.x - b.x) / 6).toFixed(2)} ${(c.y - (z.y - b.y) / 6).toFixed(2)} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`;
    }
    return d;
  };
  const top = [];
  const bottom = [];
  for (let i = 0; i < 7; i++) {
    const x = (-0.1 + i * 0.2) * width;
    const base = (0.3 + 0.08 * Math.sin(i * 0.87 + phase)) * height;
    top.push({ x, y: base });
    bottom.push({
      x,
      y: base + 0.25 * height * (0.85 + 0.22 * Math.sin(i * 0.7 + phase)),
    });
  }
  const reverse = bottom.reverse();
  return (
    curve(top, true) +
    `L${reverse[0].x.toFixed(2)} ${reverse[0].y.toFixed(2)}` +
    curve(reverse, false) +
    "Z"
  );
}

test("article header waves match a dense reference within half a unit", () => {
  const waves = headerWaves();
  assert.ok(
    waves.length >= 15,
    `expected wave paths in the built pages, found ${waves.length}`,
  );
  for (const wave of waves) {
    const flat = flattenPath(wave.d);
    assert.ok(flat, `${wave.page} wave should flatten`);
    const worst = maxDifference(
      contourColumns(flat, wave.box),
      contourColumns(reference(wave.d), wave.box),
    );
    assert.ok(
      worst <= 0.5,
      `${wave.page}: contour differs by ${worst.toFixed(3)}`,
    );
  }
});

test("card currents match a dense reference within half a unit", () => {
  for (const [width, height, phase] of [
    [640, 112, 0.4],
    [358, 174, 2.1],
    [1200, 96, 5.3],
  ]) {
    const d = cardCurrent(width, height, phase);
    const box = { x: 0, y: 0, width, height };
    const worst = maxDifference(
      contourColumns(flattenPath(d), box),
      contourColumns(reference(d), box),
    );
    assert.ok(
      worst <= 0.5,
      `${width}x${height}: contour differs by ${worst.toFixed(3)}`,
    );
  }
});

test("relative, smooth and quadratic commands flatten like their absolute forms", () => {
  const box = { x: 0, y: 0, width: 200, height: 100 };
  const pairs = [
    ["M10 10L50 20H80V60Z", "m10 10l40 10h30v40z"],
    [
      "M0 50C20 0 40 0 60 50S100 100 120 50",
      "M0 50C20 0 40 0 60 50C80 100 100 100 120 50",
    ],
    ["M0 50Q30 0 60 50T120 50", "M0 50Q30 0 60 50Q90 100 120 50"],
  ];
  for (const [a, b] of pairs)
    assert.deepEqual(
      contourColumns(flattenPath(a), box),
      contourColumns(flattenPath(b), box),
      `${a} vs ${b}`,
    );
});

test("arcs and malformed data defer to the browser", () => {
  assert.equal(flattenPath("M0 0A10 10 0 0 1 20 20"), null);
  assert.equal(flattenPath("10 10 L20 20"), null);
  assert.equal(flattenPath("M0"), null);
  assert.equal(flattenPath(""), null);
  assert.equal(
    waveContour({ x: 0, y: 0, width: 10, height: 10 }, "M0 0A5 5 0 0 1 10 10"),
    null,
  );
});

test("columns a shape does not cross sit below the canvas", () => {
  const contour = contourColumns(flattenPath("M0 0H10V10H0Z"), {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  assert.equal(contour.length, 33);
  assert.deepEqual(contour.at(-1), { x: 1440, top: 900, bottom: 900 });
});

test("contours are memoized by viewBox and path data", () => {
  const box = { x: 0, y: -200, width: 1440, height: 800 };
  const d =
    "M-120 -240H1560V300C1200 260 800 340 400 300C200 280 0 320 -120 300Z";
  const first = waveContour(box, d);
  assert.equal(waveContour({ ...box }, d), first);
  assert.notEqual(waveContour({ ...box, height: 400 }, d), first);
});
