/** Minimal TrueType outline reader for the build-time social card.
 *
 * The card is painted by the site's own rasteriser, so the display face has
 * to arrive as geometry rather than as text a browser would shape. Only what
 * a card needs is read: head, maxp, cmap format 4, loca, glyf (simple and
 * composite) and hmtx. Kerning tables are ignored, which matches how the face
 * is set on the site.
 */

const QUADRATIC_STEPS = 10;

function tableDirectory(view) {
  const count = view.getUint16(4);
  const tables = new Map();
  for (let index = 0; index < count; index++) {
    const entry = 12 + index * 16;
    let tag = "";
    for (let byte = 0; byte < 4; byte++)
      tag += String.fromCharCode(view.getUint8(entry + byte));
    tables.set(tag, {
      offset: view.getUint32(entry + 8),
      length: view.getUint32(entry + 12),
    });
  }
  return tables;
}

/** cmap format 4 gives every code point the card can need. */
function readCharacterMap(view, offset) {
  const tableCount = view.getUint16(offset + 2);
  let subtable = 0;
  for (let index = 0; index < tableCount; index++) {
    const record = offset + 4 + index * 8;
    const platform = view.getUint16(record);
    const encoding = view.getUint16(record + 2);
    const candidate = offset + view.getUint32(record + 4);
    if (
      (platform === 3 && (encoding === 1 || encoding === 10)) ||
      (platform === 0 && !subtable)
    )
      subtable = candidate;
  }
  if (!subtable) throw new Error("social card font has no unicode cmap");
  if (view.getUint16(subtable) !== 4)
    throw new Error("social card font cmap is not format 4");
  const segCount = view.getUint16(subtable + 6) / 2;
  const ends = subtable + 14;
  const starts = ends + segCount * 2 + 2;
  const deltas = starts + segCount * 2;
  const ranges = deltas + segCount * 2;
  const map = new Map();
  for (let segment = 0; segment < segCount; segment++) {
    const end = view.getUint16(ends + segment * 2);
    const start = view.getUint16(starts + segment * 2);
    const delta = view.getInt16(deltas + segment * 2);
    const rangeOffset = view.getUint16(ranges + segment * 2);
    if (start === 0xffff) continue;
    for (let code = start; code <= end; code++) {
      let glyph;
      if (rangeOffset === 0) glyph = (code + delta) & 0xffff;
      else {
        const at = ranges + segment * 2 + rangeOffset + (code - start) * 2;
        glyph = view.getUint16(at);
        if (glyph) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph) map.set(code, glyph);
    }
  }
  return map;
}

function readSimpleGlyph(view, offset, contourCount) {
  const endPoints = [];
  let cursor = offset + 10;
  for (let index = 0; index < contourCount; index++) {
    endPoints.push(view.getUint16(cursor));
    cursor += 2;
  }
  const pointCount = endPoints[endPoints.length - 1] + 1;
  cursor += 2 + view.getUint16(cursor); // instructions
  const flags = new Uint8Array(pointCount);
  for (let index = 0; index < pointCount;) {
    const flag = view.getUint8(cursor++);
    flags[index++] = flag;
    if (flag & 8) {
      let repeat = view.getUint8(cursor++);
      while (repeat-- > 0 && index < pointCount) flags[index++] = flag;
    }
  }
  const xs = new Int16Array(pointCount);
  const ys = new Int16Array(pointCount);
  let value = 0;
  for (let index = 0; index < pointCount; index++) {
    const flag = flags[index];
    if (flag & 2) {
      const delta = view.getUint8(cursor++);
      value += flag & 16 ? delta : -delta;
    } else if (!(flag & 16)) {
      value += view.getInt16(cursor);
      cursor += 2;
    }
    xs[index] = value;
  }
  value = 0;
  for (let index = 0; index < pointCount; index++) {
    const flag = flags[index];
    if (flag & 4) {
      const delta = view.getUint8(cursor++);
      value += flag & 32 ? delta : -delta;
    } else if (!(flag & 32)) {
      value += view.getInt16(cursor);
      cursor += 2;
    }
    ys[index] = value;
  }
  const contours = [];
  let start = 0;
  for (const end of endPoints) {
    const points = [];
    for (let index = start; index <= end; index++)
      points.push({ x: xs[index], y: ys[index], on: (flags[index] & 1) === 1 });
    if (points.length) contours.push(points);
    start = end + 1;
  }
  return contours;
}

/** Quadratic contours flattened to polylines, with implied on-curve midpoints
 * inserted the way the TrueType outline model defines them. */
function flattenContour(points) {
  if (!points.length) return [];
  const expanded = [];
  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    expanded.push(current);
    if (!current.on && !next.on)
      expanded.push({
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2,
        on: true,
      });
  }
  let first = expanded.findIndex((point) => point.on);
  if (first === -1) return [];
  const ordered = expanded.slice(first).concat(expanded.slice(0, first));
  const polyline = [{ x: ordered[0].x, y: ordered[0].y }];
  for (let index = 1; index <= ordered.length; index++) {
    const point = ordered[index % ordered.length];
    if (point.on) {
      polyline.push({ x: point.x, y: point.y });
      continue;
    }
    const after = ordered[(index + 1) % ordered.length];
    const from = polyline[polyline.length - 1];
    for (let step = 1; step <= QUADRATIC_STEPS; step++) {
      const t = step / QUADRATIC_STEPS;
      const u = 1 - t;
      polyline.push({
        x: u * u * from.x + 2 * u * t * point.x + t * t * after.x,
        y: u * u * from.y + 2 * u * t * point.y + t * t * after.y,
      });
    }
    polyline.push({ x: after.x, y: after.y });
    index++;
  }
  return polyline;
}

/** Reads a face and exposes advances plus flattened glyph contours. */
export function readFont(buffer) {
  const view = new DataView(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength,
  );
  const tables = tableDirectory(view);
  for (const required of ["head", "maxp", "cmap", "loca", "glyf", "hhea"])
    if (!tables.has(required))
      throw new Error(`social card font is missing ${required}`);
  const head = tables.get("head").offset;
  const unitsPerEm = view.getUint16(head + 18);
  const longLoca = view.getInt16(head + 50) === 1;
  const glyphCount = view.getUint16(tables.get("maxp").offset + 4);
  const characters = readCharacterMap(view, tables.get("cmap").offset);
  const loca = tables.get("loca").offset;
  const glyf = tables.get("glyf").offset;
  const metricCount = view.getUint16(tables.get("hhea").offset + 34);
  const hmtx = tables.get("hmtx")?.offset ?? 0;

  const glyphOffset = (index) =>
    longLoca
      ? view.getUint32(loca + index * 4)
      : view.getUint16(loca + index * 2) * 2;

  function advance(index) {
    if (!hmtx) return unitsPerEm;
    const capped = Math.min(index, metricCount - 1);
    return view.getUint16(hmtx + capped * 4);
  }

  function contoursFor(index, depth = 0) {
    if (index >= glyphCount || depth > 4) return [];
    const start = glyphOffset(index);
    const end = glyphOffset(index + 1);
    if (end <= start) return [];
    const at = glyf + start;
    const contourCount = view.getInt16(at);
    if (contourCount >= 0)
      return readSimpleGlyph(view, at, contourCount).map(flattenContour);
    const parts = [];
    let cursor = at + 10;
    let more = true;
    while (more) {
      const flags = view.getUint16(cursor);
      const componentIndex = view.getUint16(cursor + 2);
      cursor += 4;
      let dx;
      let dy;
      if (flags & 1) {
        dx = view.getInt16(cursor);
        dy = view.getInt16(cursor + 2);
        cursor += 4;
      } else {
        dx = view.getInt8(cursor);
        dy = view.getInt8(cursor + 1);
        cursor += 2;
      }
      let a = 1;
      let b = 0;
      let c = 0;
      let d = 1;
      const f2dot14 = (offset) => view.getInt16(offset) / 16384;
      if (flags & 8) {
        a = d = f2dot14(cursor);
        cursor += 2;
      } else if (flags & 0x40) {
        a = f2dot14(cursor);
        d = f2dot14(cursor + 2);
        cursor += 4;
      } else if (flags & 0x80) {
        a = f2dot14(cursor);
        b = f2dot14(cursor + 2);
        c = f2dot14(cursor + 4);
        d = f2dot14(cursor + 6);
        cursor += 8;
      }
      for (const contour of contoursFor(componentIndex, depth + 1))
        parts.push(
          contour.map((point) => ({
            x: a * point.x + c * point.y + dx,
            y: b * point.x + d * point.y + dy,
          })),
        );
      more = (flags & 0x20) !== 0;
    }
    return parts;
  }

  const cache = new Map();
  function glyph(codePoint) {
    if (cache.has(codePoint)) return cache.get(codePoint);
    const index = characters.get(codePoint) ?? 0;
    const entry = { advance: advance(index), contours: contoursFor(index) };
    cache.set(codePoint, entry);
    return entry;
  }

  return {
    unitsPerEm,
    glyph,
    has: (codePoint) => characters.has(codePoint),
    /** Advance width of a string in font units. */
    measure(text) {
      let total = 0;
      for (const character of text)
        total += glyph(character.codePointAt(0)).advance;
      return total;
    },
    /** Filled polygons for a string laid out at a pixel size, from an origin
     * on the baseline. */
    outline(text, size, originX, baselineY) {
      const scale = size / unitsPerEm;
      const polygons = [];
      let pen = originX;
      for (const character of text) {
        const entry = glyph(character.codePointAt(0));
        for (const contour of entry.contours)
          polygons.push(
            contour.map((point) => ({
              x: pen + point.x * scale,
              y: baselineY - point.y * scale,
            })),
          );
        pen += entry.advance * scale;
      }
      return polygons;
    },
  };
}
