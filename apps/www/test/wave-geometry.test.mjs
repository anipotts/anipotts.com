import assert from "node:assert/strict";
import test from "node:test";
import { builtPages } from "./built-html.mjs";
import {
  contourColumns,
  contourPath,
  cubicBezier,
  DETAIL_VIEWBOX,
  detailCurves,
  flattenPath,
  mixColor,
  morphPath,
  planMorph,
  reframeContour,
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

test("a morph result read back keeps its edge columns", () => {
  for (const seed of ["writing/awareness-is-alpha", "writing/other"])
    for (const d of detailCurves(seed)) {
      const contour = waveContour(DETAIL_VIEWBOX, d);
      const back = waveContour(
        { x: 0, y: 0, width: 1440, height: 800 },
        contourPath(contour),
      );
      assert.ok(
        maxDifference(contour, back) <= 0.1,
        `${seed}: ${maxDifference(contour, back)}`,
      );
    }
});

test("morph paths land exactly on both contours and stay on the canvas", () => {
  const [a, b] = detailCurves("writing/awareness-is-alpha").map((d) =>
    waveContour(DETAIL_VIEWBOX, d),
  );
  assert.equal(morphPath(a, b, 0), contourPath(a));
  assert.equal(morphPath(a, b, 1), contourPath(b));
  const shifted = reframeContour(
    a,
    { x: -40, y: -176, width: 1360, height: 608 },
    { x: 0, y: 0, width: 1280, height: 432 },
  );
  const xs = [
    ...morphPath(shifted, b, 0.5).matchAll(/[MLC ]?(-?[\d.]+) -?[\d.]+/g),
  ];
  assert.ok(xs.length > 0);
  for (const [, x] of xs) assert.ok(+x >= 0 && +x <= 1440, `x ${x}`);
});

test("reframing maps the same screen point into another box", () => {
  const from = { x: 10, y: -100, width: 1000, height: 500 };
  const to = { x: 0, y: 0, width: 800, height: 300 };
  const [p] = reframeContour([{ x: 720, top: 400, bottom: 800 }], from, to);
  // x: 10 + 0.5 * 1000 = 510px, 510 / 800 of the new width.
  assert.ok(Math.abs(p.x - (510 / 800) * 1440) < 1e-9);
  // top: -100 + 0.5 * 500 = 150px; bottom: 400px.
  assert.ok(Math.abs(p.top - (150 / 300) * 800) < 1e-9);
  assert.ok(Math.abs(p.bottom - (400 / 300) * 800) < 1e-9);
});

test("cubic-bezier evaluation matches the CSS curve end points and shape", () => {
  const open = cubicBezier(0.16, 1, 0.3, 1);
  const close = cubicBezier(0.65, 0, 0.35, 1);
  assert.equal(open(0), 0);
  assert.equal(open(1), 1);
  assert.ok(open(0.1) > 0.35, "open eases out fast");
  assert.ok(Math.abs(close(0.5) - 0.5) < 1e-4, "close is symmetric");
  let last = 0;
  for (let i = 1; i <= 100; i++) {
    const v = close(i / 100);
    assert.ok(v >= last - 1e-9);
    last = v;
  }
  assert.ok(Math.abs(cubicBezier(0, 0, 1, 1)(0.3) - 0.3) < 1e-4);
});

test("open condenses the card current into the header at half opacity", () => {
  const card = {
    box: { x: 0, y: 0, width: 600, height: 120 },
    group: 0.38,
    layers: Array.from({ length: 6 }, (_, i) => ({
      d: "",
      fill: `rgb(${i} 0 0)`,
      opacity: 1,
    })),
    contours: Array.from({ length: 6 }, () =>
      contourColumns([], DETAIL_VIEWBOX),
    ),
  };
  const headerD = detailCurves("writing/awareness-is-alpha");
  const header = {
    box: DETAIL_VIEWBOX,
    group: 1,
    layers: headerD.map((d) => ({ d, fill: "rgb(19, 38, 64)", opacity: 1 })),
    contours: headerD.map((d) => waveContour(DETAIL_VIEWBOX, d)),
  };
  const open = planMorph(card, header, true);
  assert.equal(open.layers.length, 6);
  assert.deepEqual(open.group, [0.38, 1]);
  for (const layer of open.layers) {
    assert.ok(Math.abs(layer.opacity[1] - 0.19) < 1e-9);
    assert.equal(layer.fill[0], layer.fill[1]);
  }
  assert.equal(open.end().layers[4].d, contourPath(header.contours[1]));
  const close = planMorph(header, card, false);
  assert.equal(close.layers.length, 6);
  assert.deepEqual(close.group, [1, 0.38]);
  assert.deepEqual(close.layers[4].opacity, [0, 1]);
  assert.deepEqual(close.layers[1].fill, ["rgb(19, 38, 64)", "rgb(1 0 0)"]);
  assert.equal(
    mixColor("rgb(0, 0, 0)", "rgb(100 200 50)", 0.5),
    "rgb(50 100 25)",
  );
});

test("a band the card shows in part or not at all never sweeps a straight edge through the surface", () => {
  const columns = 33;
  const header = detailCurves("writing/awareness-is-alpha");
  const headerArt = {
    box: DETAIL_VIEWBOX,
    group: 1,
    layers: header.map((d) => ({ d, fill: "rgb(19 38 64)", opacity: 1 })),
    contours: header.map((d) => waveContour(DETAIL_VIEWBOX, d)),
  };
  const empty = () => ({ top: 900, bottom: 900 });
  const x = (i) => (i * 1440) / (columns - 1);
  const partial = Array.from({ length: columns }, (_, i) =>
    i < 17
      ? { x: x(i), ...empty() }
      : { x: x(i), top: 760 - (i - 17) * 40, bottom: 900 },
  );
  const below = Array.from({ length: columns }, (_, i) => ({
    x: x(i),
    ...empty(),
  }));
  const above = Array.from({ length: columns }, (_, i) => ({
    x: x(i),
    top: -100,
    bottom: -100,
  }));
  const card = {
    box: { x: 0, y: 0, width: 472, height: 64 },
    group: 0.38,
    layers: [0, 1, 2].map(() => ({
      d: "",
      fill: "rgb(97 171 234)",
      opacity: 1,
    })),
    contours: [partial, below, above],
  };
  // Longest run of neighbouring columns inside the canvas that spans less
  // than half a unit: a straight horizontal edge across 10 columns or more
  // (the header art alone has shallow troughs a few columns wide).
  const flatRun = (edge) => {
    let longest = 1;
    for (let i = 0; i < edge.length; i++)
      for (let j = i; j < edge.length; j++) {
        const run = edge.slice(i, j + 1);
        if (!run.every((y) => y > 0 && y < 800)) break;
        if (Math.max(...run) - Math.min(...run) >= 0.5) break;
        longest = Math.max(longest, run.length);
      }
    return longest;
  };
  const plans = [
    ["open", planMorph(card, headerArt, true)],
    ["close", planMorph(headerArt, card, false)],
  ];
  for (const [name, plan] of plans)
    plan.layers.forEach(({ a, b }, layer) => {
      // The first and last frames still match the artwork on each side.
      for (const [side, art] of [
        [a, name === "open" ? card.contours : headerArt.contours],
        [b, name === "open" ? headerArt.contours : card.contours],
      ]) {
        const source = art[layer % art.length];
        side.forEach((p, i) => {
          const shown = source[i];
          const visible = shown.top < 800 && shown.bottom > 0;
          if (visible)
            assert.deepEqual(p, shown, `${name} ${layer} column ${i}`);
          else
            assert.ok(
              p.top >= 800 || p.bottom <= 0,
              `${name} ${layer} column ${i} stays off the canvas`,
            );
        });
      }
      for (let step = 1; step < 20; step++) {
        const t = step / 20;
        const at = (key) => a.map((p, i) => p[key] + (b[i][key] - p[key]) * t);
        for (const key of ["top", "bottom"])
          assert.ok(
            flatRun(at(key)) < 10,
            `${name} layer ${layer} ${key} is straight at t ${t}`,
          );
      }
    });
});
