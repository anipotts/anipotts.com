/** A small scanline rasteriser and PNG writer for the build-time card.
 *
 * The card is flat colour, a few wave bands and display type as outlines, so
 * a dependency-free painter keeps the build deterministic on every machine
 * and keeps the file small. Coverage is exact across a scanline and sampled
 * four times down it, which is enough antialiasing for type this large.
 */

import { deflateSync } from "node:zlib";

const SUB_ROWS = 4;

export function createCanvas(width, height, background) {
  const pixels = new Uint8Array(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    pixels[index] = background[0];
    pixels[index + 1] = background[1];
    pixels[index + 2] = background[2];
  }
  return { width, height, pixels };
}

function edgesOf(polygons) {
  const edges = [];
  for (const polygon of polygons) {
    for (let index = 0; index < polygon.length; index++) {
      const from = polygon[index];
      const to = polygon[(index + 1) % polygon.length];
      if (from.y === to.y) continue;
      edges.push({
        yTop: Math.min(from.y, to.y),
        yBottom: Math.max(from.y, to.y),
        x: from.x,
        y: from.y,
        slope: (to.x - from.x) / (to.y - from.y),
        winding: to.y > from.y ? 1 : -1,
      });
    }
  }
  edges.sort((a, b) => a.yTop - b.yTop);
  return edges;
}

/** Fills polygons with the nonzero winding rule. */
export function fillPolygons(canvas, polygons, color, alpha = 1) {
  const edges = edgesOf(polygons);
  if (!edges.length || alpha <= 0) return;
  const { width, height, pixels } = canvas;
  const coverage = new Float64Array(width);
  const crossings = [];
  let active = [];
  let next = 0;
  const firstRow = Math.max(0, Math.floor(edges[0].yTop));
  const lastRow = Math.min(
    height - 1,
    Math.ceil(Math.max(...edges.map((edge) => edge.yBottom))),
  );
  for (let row = firstRow; row <= lastRow; row++) {
    coverage.fill(0);
    let painted = false;
    for (let sub = 0; sub < SUB_ROWS; sub++) {
      const y = row + (sub + 0.5) / SUB_ROWS;
      while (next < edges.length && edges[next].yTop <= y)
        active.push(edges[next++]);
      active = active.filter((edge) => edge.yBottom > y);
      crossings.length = 0;
      for (const edge of active) {
        if (edge.yTop > y) continue;
        crossings.push({
          x: edge.x + (y - edge.y) * edge.slope,
          winding: edge.winding,
        });
      }
      if (crossings.length < 2) continue;
      crossings.sort((a, b) => a.x - b.x);
      let winding = 0;
      for (let index = 0; index < crossings.length - 1; index++) {
        winding += crossings[index].winding;
        if (winding === 0) continue;
        const from = Math.max(0, crossings[index].x);
        const to = Math.min(width, crossings[index + 1].x);
        if (to <= from) continue;
        painted = true;
        const start = Math.floor(from);
        const end = Math.floor(to - 1e-9);
        if (start === end) coverage[start] += to - from;
        else {
          coverage[start] += start + 1 - from;
          for (let column = start + 1; column < end; column++)
            coverage[column] += 1;
          coverage[end] += to - end;
        }
      }
    }
    if (!painted) continue;
    const rowStart = row * width * 3;
    for (let column = 0; column < width; column++) {
      const amount = (coverage[column] / SUB_ROWS) * alpha;
      if (amount <= 0) continue;
      const blend = amount > 1 ? 1 : amount;
      const at = rowStart + column * 3;
      for (let channel = 0; channel < 3; channel++) {
        const current = pixels[at + channel];
        pixels[at + channel] = Math.round(
          current + (color[channel] - current) * blend,
        );
      }
    }
  }
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}

/** Encodes 8-bit RGB with a per-row filter chosen by smallest absolute sum. */
export function encodePng(canvas) {
  const { width, height, pixels } = canvas;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  const none = Buffer.alloc(stride);
  const sub = Buffer.alloc(stride);
  const up = Buffer.alloc(stride);
  for (let row = 0; row < height; row++) {
    const at = row * stride;
    let noneSum = 0;
    let subSum = 0;
    let upSum = 0;
    for (let index = 0; index < stride; index++) {
      const value = pixels[at + index];
      const left = index >= 3 ? pixels[at + index - 3] : 0;
      const above = row ? pixels[at - stride + index] : 0;
      none[index] = value;
      sub[index] = (value - left) & 0xff;
      up[index] = (value - above) & 0xff;
      noneSum += value < 128 ? value : 256 - value;
      subSum += sub[index] < 128 ? sub[index] : 256 - sub[index];
      upSum += up[index] < 128 ? up[index] : 256 - up[index];
    }
    const best =
      upSum <= subSum && upSum <= noneSum
        ? [2, up]
        : subSum <= noneSum
          ? [1, sub]
          : [0, none];
    raw[row * (stride + 1)] = best[0];
    best[1].copy(raw, row * (stride + 1) + 1);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
