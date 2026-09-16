/** Paints the site and per-essay social cards at build time.
 *
 * One composition: the site blue canvas, a restrained pass of the same wave
 * geometry the writing pages use, and the monogram and type set hard left in
 * white. Everything that has to survive a square thumbnail sits inside the
 * central 630 by 630 area, so a phone unfurl still reads the name.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { readFont } from "./truetype.mjs";
import { createCanvas, fillPolygons, encodePng } from "./raster.mjs";

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;
/** The square a chat client crops to; nothing that must be read leaves it. */
export const SAFE_LEFT = (CARD_WIDTH - CARD_HEIGHT) / 2;
export const SAFE_RIGHT = SAFE_LEFT + CARD_HEIGHT;

const GUTTER = 3;
const TEXT_LEFT = SAFE_LEFT + GUTTER;
const TEXT_WIDTH = SAFE_RIGHT - GUTTER - TEXT_LEFT;

const BRAND_PACKET = "packages/brand/ap-structural-v0.2.0-candidate.1";
const FONT_FILE = `${BRAND_PACKET}/fonts/APStructuralDisplayBlack-v0.2.0-candidate.1.ttf`;
const MARK_FILE = `${BRAND_PACKET}/marks/ap-mark-on-dark.svg`;

const BLUE = [0x61, 0xab, 0xea];
const WHITE = [0xff, 0xff, 0xff];
// The light-theme writing currents, kept at the same restraint as the page.
const WAVE_LAYERS = [
  { color: [0xb0, 0xd8, 0xf5], alpha: 0.2 },
  { color: [0x3d, 0x80, 0xd4], alpha: 0.16 },
  { color: [0x22, 0x59, 0xbf], alpha: 0.13 },
];

/** Finds a workspace file from wherever the build was started. */
function workspaceFile(relative) {
  let directory = process.cwd();
  for (let step = 0; step < 8; step++) {
    const candidate = join(directory, relative);
    try {
      return readFileSync(candidate);
    } catch {
      const parent = dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  throw new Error(
    `social card asset not found from ${process.cwd()}: ${relative}`,
  );
}

let cachedFont;
function font() {
  if (!cachedFont) cachedFont = readFont(workspaceFile(FONT_FILE));
  return cachedFont;
}

const NUMBER = /[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)/g;

/** The monogram ships as absolute M, L, H, V, Q and Z path data. */
function flattenMarkPath(data) {
  const tokens = data.match(NUMBER) ?? [];
  const contours = [];
  let points = [];
  let index = 0;
  let command = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const next = () => Number(tokens[index++]);
  const push = (px, py) => {
    points.push({ x: px, y: py });
    x = px;
    y = py;
  };
  while (index < tokens.length) {
    if (/[A-Za-z]/.test(tokens[index])) command = tokens[index++];
    switch (command) {
      case "M": {
        if (points.length > 1) contours.push(points);
        points = [];
        const px = next();
        const py = next();
        push(px, py);
        startX = px;
        startY = py;
        break;
      }
      case "L": {
        const px = next();
        push(px, next());
        break;
      }
      case "H":
        push(next(), y);
        break;
      case "V":
        push(x, next());
        break;
      case "Q": {
        const cx = next();
        const cy = next();
        const px = next();
        const py = next();
        const fromX = x;
        const fromY = y;
        for (let step = 1; step <= 8; step++) {
          const t = step / 8;
          const u = 1 - t;
          push(
            u * u * fromX + 2 * u * t * cx + t * t * px,
            u * u * fromY + 2 * u * t * cy + t * t * py,
          );
        }
        break;
      }
      case "Z":
      case "z":
        push(startX, startY);
        if (points.length > 1) contours.push(points);
        points = [];
        break;
      default:
        throw new Error(`unsupported monogram path command: ${command}`);
    }
  }
  if (points.length > 1) contours.push(points);
  return contours;
}

let cachedMark;
/** Reads the brand monogram and normalises it to a unit box. */
function markGeometry() {
  if (cachedMark) return cachedMark;
  const svg = workspaceFile(MARK_FILE).toString("utf8");
  const group = svg.match(
    /<g transform="translate\(([-\d.]+),([-\d.]+)\) scale\(([-\d.]+),([-\d.]+)\)"/,
  );
  if (!group) throw new Error("monogram transform not recognised");
  const [, groupX, groupY, scaleX, scaleY] = group.map(Number);
  const polygons = [];
  const paths = svg.matchAll(
    /<path d="([^"]+)"[^>]*transform="translate\(([-\d.]+),([-\d.]+)\)"/g,
  );
  for (const [, data, shiftX, shiftY] of paths)
    for (const contour of flattenMarkPath(data))
      polygons.push(
        contour.map((point) => ({
          x: groupX + (point.x + Number(shiftX)) * scaleX,
          y: groupY + (point.y + Number(shiftY)) * scaleY,
        })),
      );
  if (!polygons.length) throw new Error("monogram has no outlines");
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polygon of polygons)
    for (const point of polygon) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  cachedMark = {
    polygons,
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
  };
  return cachedMark;
}

function markPolygons(height, left, top) {
  const mark = markGeometry();
  const scale = height / mark.height;
  return mark.polygons.map((contour) =>
    contour.map((point) => ({
      x: left + (point.x - mark.minX) * scale,
      y: top + (point.y - mark.minY) * scale,
    })),
  );
}

/** The writing page currents, sampled once instead of animated. */
function wavePolygons(seed) {
  let hash = 2166136261;
  for (const character of seed)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  const phase = ((hash >>> 0) / 4294967296) * Math.PI * 2;
  const scaleX = CARD_WIDTH / 1440;
  const scaleY = CARD_HEIGHT / 800;
  return [0, 1, 2].map((layer) => {
    const points = Array.from({ length: 8 }, (_, i) => ({
      x: (-120 + i * 240) * scaleX,
      y:
        (350 +
          layer * 82 +
          Math.sin(i * 0.78 + phase) * 92 +
          Math.cos(i * 1.24 + phase) * 35) *
        scaleY,
    }));
    const polygon = [
      { x: -160, y: -160 },
      { x: CARD_WIDTH + 160, y: -160 },
      { x: CARD_WIDTH + 160, y: points[points.length - 1].y },
    ];
    const reverse = [...points].reverse();
    for (let i = 0; i < reverse.length - 1; i++) {
      const a = reverse[Math.max(0, i - 1)];
      const b = reverse[i];
      const c = reverse[i + 1];
      const d = reverse[Math.min(reverse.length - 1, i + 2)];
      const x1 = b.x + (c.x - a.x) / 6;
      const y1 = b.y + (c.y - a.y) / 6;
      const x2 = c.x - (d.x - b.x) / 6;
      const y2 = c.y - (d.y - b.y) / 6;
      for (let step = 1; step <= 12; step++) {
        const t = step / 12;
        const u = 1 - t;
        polygon.push({
          x:
            u * u * u * b.x +
            3 * u * u * t * x1 +
            3 * u * t * t * x2 +
            t * t * t * c.x,
          y:
            u * u * u * b.y +
            3 * u * u * t * y1 +
            3 * u * t * t * y2 +
            t * t * t * c.y,
        });
      }
    }
    return polygon;
  });
}

/** Greedy word wrap at a given size, or null when a word cannot fit. */
function wrap(text, size, maxWidth) {
  const face = font();
  const scale = size / face.unitsPerEm;
  const widthOf = (value) => face.measure(value) * scale;
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (widthOf(word) > maxWidth) return null;
    const candidate = line ? `${line} ${word}` : word;
    if (widthOf(candidate) <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest size at which the text fits the box in at most maxLines lines. */
function fitText(text, { maxWidth, maxHeight, maxLines, leading, from, to }) {
  for (let size = from; size >= to; size -= 1) {
    const lines = wrap(text, size, maxWidth);
    if (!lines || lines.length > maxLines) continue;
    const height = (lines.length - 1) * size * leading + size;
    if (height <= maxHeight) return { size, lines, height };
  }
  const lines = wrap(text, to, maxWidth) ?? [text];
  return {
    size: to,
    lines,
    height: (lines.length - 1) * to * leading + to,
  };
}

function linePolygons(lines, size, left, firstBaseline, leading) {
  const face = font();
  return lines.flatMap((line, index) =>
    face.outline(line, size, left, firstBaseline + index * size * leading),
  );
}

/** Centres the painted block on the card by its real ink, so descenders and
 * the monogram's own bearings cannot push type out of the safe area. */
function centreVertically(polygons) {
  let top = Infinity;
  let bottom = -Infinity;
  for (const contour of polygons)
    for (const point of contour) {
      if (point.y < top) top = point.y;
      if (point.y > bottom) bottom = point.y;
    }
  const shift = (CARD_HEIGHT - (bottom - top)) / 2 - top;
  for (const contour of polygons) for (const point of contour) point.y += shift;
}

/** The monogram and type of one card, already centred on the canvas. */
function composeInk({ title, name }) {
  const markHeight = title ? 62 : 100;
  const markGap = title ? 52 : 68;
  const ink = markPolygons(markHeight, TEXT_LEFT, 0);
  let cursor = markHeight + markGap;
  if (title) {
    const titleBlock = fitText(title, {
      maxWidth: TEXT_WIDTH,
      maxHeight: 316,
      maxLines: 4,
      leading: 1.08,
      from: 92,
      to: 44,
    });
    ink.push(
      ...linePolygons(
        titleBlock.lines,
        titleBlock.size,
        TEXT_LEFT,
        cursor + titleBlock.size,
        1.08,
      ),
    );
    cursor += titleBlock.height + 50;
    ink.push(...linePolygons([name], 38, TEXT_LEFT, cursor + 38, 1));
  } else {
    const nameBlock = fitText(name, {
      maxWidth: TEXT_WIDTH,
      maxHeight: 330,
      maxLines: 2,
      leading: 0.98,
      from: 160,
      to: 72,
    });
    ink.push(
      ...linePolygons(
        nameBlock.lines,
        nameBlock.size,
        TEXT_LEFT,
        cursor + nameBlock.size,
        0.98,
      ),
    );
  }
  centreVertically(ink);
  return ink;
}

/** Renders one card. `title` is null for the site card. */
export function renderCard({ title = null, name, seed }) {
  const canvas = createCanvas(CARD_WIDTH, CARD_HEIGHT, BLUE);
  for (const [index, polygon] of wavePolygons(seed).entries())
    fillPolygons(
      canvas,
      [polygon],
      WAVE_LAYERS[index].color,
      WAVE_LAYERS[index].alpha,
    );
  fillPolygons(canvas, composeInk({ title, name }), WHITE);
  return encodePng(canvas);
}

/** The box the painted monogram and type occupy, so a test can prove the
 * card still reads after a square thumbnail crop. */
export function cardInkBounds({ title = null, name }) {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const contour of composeInk({ title, name }))
    for (const point of contour) {
      left = Math.min(left, point.x);
      top = Math.min(top, point.y);
      right = Math.max(right, point.x);
      bottom = Math.max(bottom, point.y);
    }
  return { left, top, right, bottom };
}
