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
      if ((a.x <= x && b.x > x) || (b.x <= x && a.x > x)) {
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
