/** Wave contours for the writing card and article header choreography.
 *
 * The morph samples each wave as top and bottom edges across fixed columns.
 * Asking the browser for points along a path (getPointAtLength) is slow
 * enough to freeze the first frame of every open and close, so the site's
 * own path data is flattened here instead. The waves use absolute M, L, H,
 * V, C and Z commands; relative commands, S, Q and T are handled too. Arcs
 * return null so the caller can fall back to the browser for that path.
 */

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };
export type Contour = { x: number; top: number; bottom: number }[];

/** Columns across the normalized 1440 by 800 morph canvas. */
export const CONTOUR_COLUMNS = 33;
const CURVE_STEPS = 24;
const NUMBER = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g;

/** Flattens path data to a polyline, or null for arcs or malformed data. */
export function flattenPath(d: string, steps = CURVE_STEPS): Point[] | null {
  const tokens = d.match(NUMBER);
  if (!tokens) return null;
  const points: Point[] = [];
  let i = 0;
  let command = "";
  let previous = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let controlX = 0;
  let controlY = 0;
  const next = () => Number(tokens[i++]);
  const add = (px: number, py: number) => {
    points.push({ x: px, y: py });
    x = px;
    y = py;
  };
  const cubic = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
  ) => {
    const x0 = x;
    const y0 = y;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const e = t * t * t;
      add(a * x0 + b * x1 + c * x2 + e * x3, a * y0 + b * y1 + c * y2 + e * y3);
    }
    controlX = x2;
    controlY = y2;
  };
  const quadratic = (x1: number, y1: number, x2: number, y2: number) => {
    const x0 = x;
    const y0 = y;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const u = 1 - t;
      add(
        u * u * x0 + 2 * u * t * x1 + t * t * x2,
        u * u * y0 + 2 * u * t * y1 + t * t * y2,
      );
    }
    controlX = x1;
    controlY = y1;
  };
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      command = tokens[i++];
      if (command === "Z" || command === "z") {
        if (points.length) add(startX, startY);
        previous = "Z";
        continue;
      }
    } else if (!command) return null;
    if (i >= tokens.length) return null;
    const relative = command !== command.toUpperCase();
    const ox = relative ? x : 0;
    const oy = relative ? y : 0;
    const upper = command.toUpperCase();
    switch (upper) {
      case "M":
        add(next() + ox, next() + oy);
        startX = x;
        startY = y;
        // Further coordinate pairs after a move are implicit line commands.
        command = relative ? "l" : "L";
        break;
      case "L":
        add(next() + ox, next() + oy);
        break;
      case "H":
        add(next() + ox, y);
        break;
      case "V":
        add(x, next() + oy);
        break;
      case "C":
        cubic(
          next() + ox,
          next() + oy,
          next() + ox,
          next() + oy,
          next() + ox,
          next() + oy,
        );
        break;
      case "S": {
        const reflect = previous === "C" || previous === "S";
        const x1 = reflect ? 2 * x - controlX : x;
        const y1 = reflect ? 2 * y - controlY : y;
        cubic(x1, y1, next() + ox, next() + oy, next() + ox, next() + oy);
        break;
      }
      case "Q":
        quadratic(next() + ox, next() + oy, next() + ox, next() + oy);
        break;
      case "T": {
        const reflect = previous === "Q" || previous === "T";
        quadratic(
          reflect ? 2 * x - controlX : x,
          reflect ? 2 * y - controlY : y,
          next() + ox,
          next() + oy,
        );
        break;
      }
      default:
        return null;
    }
    previous = upper;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  }
  return points;
}

/** Top and bottom edge of a polyline at each column, normalized so the
 * viewBox maps to 0..800 vertically and 0..1440 horizontally. Columns the
 * shape does not cross sit at 900, below the canvas. */
export function contourColumns(
  points: readonly Point[],
  box: Box,
  columns = CONTOUR_COLUMNS,
): Contour {
  const normalize = (y: number) =>
    Math.max(-100, Math.min(900, ((y - box.y) / box.height) * 800));
  const last = columns - 1;
  return Array.from({ length: columns }, (_, i) => {
    const x = box.x + (box.width * i) / last;
    let top = Infinity;
    let bottom = -Infinity;
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1];
      const b = points[j];
      // Edges count as crossings, so a shape that ends exactly on the last
      // column (a morph result read back) keeps that column.
      if (a.x === b.x) {
        if (a.x === x) {
          top = Math.min(top, a.y, b.y);
          bottom = Math.max(bottom, a.y, b.y);
        }
      } else if ((a.x <= x && b.x >= x) || (b.x <= x && a.x >= x)) {
        const y = a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    return {
      x: (i * 1440) / last,
      top: top === Infinity ? 900 : normalize(top),
      bottom: bottom === -Infinity ? 900 : normalize(bottom),
    };
  });
}

const cache = new Map<string, Contour>();
const CACHE_LIMIT = 160;

/** Contour for one path, memoized by viewBox and path data. Returns null
 * when the path needs the browser fallback. */
export function waveContour(
  box: Box,
  d: string,
  columns = CONTOUR_COLUMNS,
): Contour | null {
  const key = `${box.x} ${box.y} ${box.width} ${box.height} ${columns}|${d}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const points = flattenPath(d);
  if (!points) return null;
  const contour = contourColumns(points, box, columns);
  cache.set(key, contour);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return contour;
}

/** The article header viewBox DetailWaves renders. */
export const DETAIL_VIEWBOX: Box = { x: 0, y: -200, width: 1440, height: 800 };

/** Header wave paths for a page seed, bottom layer first. DetailWaves
 * renders them reversed; the markup it emits must not change. */
export function detailCurves(seed: string): string[] {
  let hash = 2166136261;
  for (const char of seed)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const phase = ((hash >>> 0) / 4294967296) * Math.PI * 2;
  return [0, 1, 2].map((layer) => {
    const points = Array.from({ length: 8 }, (_, i) => ({
      x: -120 + i * 240,
      y:
        150 +
        layer * 82 +
        Math.sin(i * 0.78 + phase) * 92 +
        Math.cos(i * 1.24 + phase) * 35,
    }));
    let path = `M-120 -240H1560V${points.at(-1)!.y}`;
    const reverse = [...points].reverse();
    for (let i = 0; i < reverse.length - 1; i++) {
      const a = reverse[Math.max(0, i - 1)],
        b = reverse[i],
        c = reverse[i + 1],
        d = reverse[Math.min(reverse.length - 1, i + 2)];
      path += `C${b.x + (c.x - a.x) / 6} ${b.y + (c.y - a.y) / 6} ${c.x - (d.x - b.x) / 6} ${c.y - (d.y - b.y) / 6} ${c.x} ${c.y}`;
    }
    return path + "Z";
  });
}

/** CSS cubic-bezier() timing function evaluated at progress x in 0..1. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (t: number, a: number, b: number) =>
    ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
  const slope = (t: number, a: number, b: number) =>
    3 * (1 - 3 * b + 3 * a) * t * t + 2 * (3 * b - 6 * a) * t + 3 * a;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (Math.abs(s) < 1e-6) break;
      t -= (at(t, x1, x2) - x) / s;
    }
    if (!(t >= 0 && t <= 1) || Math.abs(at(t, x1, x2) - x) > 1e-5) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 30; i++) {
        t = (lo + hi) / 2;
        if (at(t, x1, x2) < x) lo = t;
        else hi = t;
      }
    }
    return at(t, y1, y2);
  };
}

/** Re-expresses a contour normalized to one screen box (0..1440 by 0..800)
 * in the normalized space of another box, so a wave drawn in a clamped
 * wrapper still lands where the full artwork sits. */
export function reframeContour(contour: Contour, from: Box, to: Box): Contour {
  const sx = from.width / to.width;
  const sy = from.height / to.height;
  const ox = ((from.x - to.x) / to.width) * 1440;
  const oy = ((from.y - to.y) / to.height) * 800;
  return contour.map((p) => ({
    x: p.x * sx + ox,
    top: p.top * sy + oy,
    bottom: p.bottom * sy + oy,
  }));
}

const one = (v: number) => Math.round(v * 10) / 10;

/** Closed path through a contour's top edge and back along its bottom,
 * one decimal, x clamped to the 0..1440 canvas. */
export function contourPath(points: Contour): string {
  const x = (v: number) => one(Math.max(0, Math.min(1440, v)));
  const run = (pts: Point[]) => {
    let d = "";
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[Math.max(0, i - 1)],
        b = pts[i],
        c = pts[i + 1],
        z = pts[Math.min(pts.length - 1, i + 2)];
      d += `C${x(b.x + (c.x - a.x) / 6)} ${one(b.y + (c.y - a.y) / 6)} ${x(c.x - (z.x - b.x) / 6)} ${one(c.y - (z.y - b.y) / 6)} ${x(c.x)} ${one(c.y)}`;
    }
    return d;
  };
  const top = points.map((p) => ({ x: p.x, y: p.top }));
  const bottom = points.map((p) => ({ x: p.x, y: p.bottom })).reverse();
  return `M${x(top[0].x)} ${one(top[0].y)}${run(top)}L${x(bottom[0].x)} ${one(bottom[0].y)}${run(bottom)}Z`;
}

/** The path between two contours with the same column count at t. */
export function morphPath(a: Contour, b: Contour, t: number): string {
  return contourPath(
    a.map((p, i) => ({
      x: p.x + (b[i].x - p.x) * t,
      top: p.top + (b[i].top - p.top) * t,
      bottom: p.bottom + (b[i].bottom - p.bottom) * t,
    })),
  );
}

export type ArtLayer = { d: string; fill: string; opacity: number };
/** Wave artwork as plain data: viewBox, group opacity and layers. */
export type Art = { box: Box; group: number; layers: ArtLayer[] };
export type ArtShape = Art & { contours: Contour[] };
export const MORPH_BOX: Box = { x: 0, y: 0, width: 1440, height: 800 };
/** A contour normalized to one screen box, re-expressed in another. */
export type Frame = [from: Box, to: Box];
export interface MorphLayer {
  a: Contour;
  b: Contour;
  opacity: [number, number];
  fill: [string, string];
}
export interface MorphPlan {
  group: [number, number];
  layers: MorphLayer[];
  /** The artwork the destination keeps once the morph lands. */
  end(): Art;
}

/** Card columns a band misses sit clamped at one height off the canvas, and
 * a straight clamped edge morphing to the header's straight top edge would
 * sweep through the surface as a flat slab. Those columns take the other
 * artwork's lower edge instead, shifted just off the canvas on the side the
 * band passes, so every edge that crosses the canvas carries a wave. Columns
 * the card shows are unchanged, and nothing moves onto the canvas at t 0. */
function offCanvas(card: Contour, other: Contour): Contour {
  const lows = other.map((p) => p.bottom);
  const down = Math.max(0, 801 - Math.min(...lows));
  const up = Math.max(0, Math.max(...lows) + 1);
  return card.map((p, i) => {
    if (p.top >= 800) {
      const y = other[i].bottom + down;
      return { x: p.x, top: y, bottom: y };
    }
    if (p.bottom <= 0) {
      const y = other[i].bottom - up;
      return { x: p.x, top: y, bottom: y };
    }
    return p;
  });
}

/** Pairs artwork layers for the card and header morph.
 *
 * Open keeps every card layer and condenses it into the header contours at
 * half its card opacity, the bright band production shows after an in-site
 * open. Close pairs header layers with the destination card's; layers only
 * one side has fade in or out. */
export function planMorph(
  from: ArtShape,
  to: ArtShape,
  open: boolean,
  fromFrame?: Frame,
  toFrame?: Frame,
): MorphPlan {
  const n = open
    ? from.layers.length
    : Math.max(from.layers.length, to.layers.length);
  const at = <T>(list: T[], i: number) => list[i % list.length];
  const frame = (c: Contour, f?: Frame) =>
    f ? reframeContour(c, f[0], f[1]) : c;
  const layers = Array.from({ length: n }, (_, i): MorphLayer => {
    const a = at(from.layers, i);
    const b = at(to.layers, i);
    const source = i < from.layers.length ? a : { ...b, opacity: 0 };
    const target = open
      ? { ...a, opacity: a.opacity * from.group * 0.5 }
      : i < to.layers.length
        ? b
        : { ...b, opacity: 0 };
    const fromContour = frame(at(from.contours, i), fromFrame);
    const toContour = frame(at(to.contours, i), toFrame);
    // The card is the source on open and the destination on close.
    return {
      a: open ? offCanvas(fromContour, toContour) : fromContour,
      b: open ? toContour : offCanvas(toContour, fromContour),
      opacity: [source.opacity, target.opacity],
      fill: [source.fill, target.fill],
    };
  });
  return {
    group: [from.group, open ? 1 : to.group],
    layers,
    end: () => ({
      box: MORPH_BOX,
      group: open ? 1 : to.group,
      layers: layers.map((layer, i) => ({
        d: contourPath(at(to.contours, i)),
        fill: layer.fill[1],
        opacity: layer.opacity[1],
      })),
    }),
  };
}

const channels = (color: string) =>
  (color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);

/** The flat colour a stack of wave layers paints over an opaque ground: each
 * layer (bottom first) at its own opacity inside a group faded by `alpha`,
 * the way an SVG group with opacity composites. Returns null when a colour
 * cannot be parsed, so callers keep their declared fallback. */
export function compositeLayers(
  ground: string,
  layers: { fill: string; opacity: number }[],
  alpha: number,
) {
  const base = channels(ground);
  if (base.length !== 3) return null;
  let color = [0, 0, 0];
  let coverage = 0;
  for (const { fill, opacity } of layers) {
    const c = channels(fill);
    if (c.length !== 3) return null;
    color = color.map((v, k) => c[k] * opacity + v * (1 - opacity));
    coverage = opacity + coverage * (1 - opacity);
  }
  const out = base.map((v, k) =>
    Math.round(color[k] * alpha + v * (1 - coverage * alpha)),
  );
  return `rgb(${out.join(", ")})`;
}

/** rgb() colors mixed at t; unparsable colors switch at the midpoint. */
export function mixColor(a: string, b: string, t: number) {
  if (a === b) return a;
  const x = channels(a);
  const y = channels(b);
  if (x.length !== 3 || y.length !== 3) return t < 0.5 ? a : b;
  return `rgb(${x.map((v, k) => Math.round(v + (y[k] - v) * t)).join(" ")})`;
}
