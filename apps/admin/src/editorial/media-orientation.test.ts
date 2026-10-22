import { describe, expect, it } from "vitest";
import {
  encodedCropRectangle,
  mediaExifOrientation,
} from "./media-orientation";
import {
  joinBytes,
  orientationJpeg,
  orientationTiff,
  pngChunk,
  pngFixture,
} from "../../test/fixtures/media-processing";

type Orientation = Parameters<typeof encodedCropRectangle>[3];
const orientations: Orientation[] = [1, 2, 3, 4, 5, 6, 7, 8];
function webp(tiff: Uint8Array) {
  const chunk = new Uint8Array(8 + tiff.length + (tiff.length & 1));
  chunk.set([69, 88, 73, 70]);
  new DataView(chunk.buffer).setUint32(4, tiff.length, true);
  chunk.set(tiff, 8);
  const header = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
  new DataView(header.buffer).setUint32(4, chunk.length + 4, true);
  return joinBytes([header, chunk]);
}
const transpose = (matrix: number[][]) =>
  matrix[0]!.map((_, x) => matrix.map((row) => row[x]!));
// Independent pixel-label oracle: transpose and/or reverse actual rows/columns,
// rather than repeating the inverse rectangle formulas from production.
function orient(matrix: number[][], orientation: Orientation): number[][] {
  const rows =
    orientation >= 5 ? transpose(matrix) : matrix.map((row) => [...row]);
  if ([3, 4, 7, 8].includes(orientation)) rows.reverse();
  if ([2, 3, 6, 7].includes(orientation)) rows.forEach((row) => row.reverse());
  return rows;
}
const cut = (
  matrix: number[][],
  rect: { x: number; y: number; width: number; height: number },
) =>
  matrix
    .slice(rect.y, rect.y + rect.height)
    .map((row) => row.slice(rect.x, rect.x + rect.width));

describe("bounded EXIF orientation and encoded-axis crop coordinates", () => {
  it("pins the independent pixel oracle's clockwise and counterclockwise axes", () => {
    const pixels = [
      [1, 2, 3],
      [4, 5, 6],
    ];
    expect(orient(pixels, 6)).toEqual([
      [4, 1],
      [5, 2],
      [6, 3],
    ]);
    expect(orient(pixels, 8)).toEqual([
      [3, 6],
      [2, 5],
      [1, 4],
    ]);
  });
  it.each(orientations)(
    "reads orientation %i from little/big-endian JPEG, PNG and WebP metadata",
    (orientation) => {
      for (const little of [true, false]) {
        const tiff = orientationTiff(orientation, little);
        expect(
          mediaExifOrientation(
            orientationJpeg(orientation, little),
            "image/jpeg",
          ),
        ).toBe(orientation);
        expect(
          mediaExifOrientation(
            pngFixture(8, 6, { beforeData: [pngChunk("eXIf", tiff)] }),
            "image/png",
          ),
        ).toBe(orientation);
        expect(mediaExifOrientation(webp(tiff), "image/webp")).toBe(
          orientation,
        );
      }
    },
  );
  it.each(orientations)(
    "preserves the selected asymmetric pixel labels for orientation %i",
    (orientation) => {
      const encoded = { width: 8, height: 6 };
      const matrix = Array.from({ length: encoded.height }, (_, y) =>
        Array.from({ length: encoded.width }, (_, x) => y * 8 + x),
      );
      const displayed = orient(matrix, orientation);
      const display = { width: displayed[0]!.length, height: displayed.length };
      for (const rectangle of [
        { x: 1, y: 1, width: 2, height: 3 },
        { x: 0, y: 2, width: 3, height: 2 },
      ]) {
        const mapped = encodedCropRectangle(
          encoded,
          display,
          rectangle,
          orientation,
        );
        expect(mapped.x).toBeGreaterThanOrEqual(0);
        expect(mapped.y).toBeGreaterThanOrEqual(0);
        expect(mapped.x + mapped.width).toBeLessThanOrEqual(encoded.width);
        expect(mapped.y + mapped.height).toBeLessThanOrEqual(encoded.height);
        expect(orient(cut(matrix, mapped), orientation)).toEqual(
          cut(displayed, rectangle),
        );
      }
    },
  );
  it("keeps missing orientation at 1, including unrelated APP metadata", () => {
    expect(
      mediaExifOrientation(new Uint8Array([255, 216, 255, 217]), "image/jpeg"),
    ).toBe(1);
    expect(mediaExifOrientation(pngFixture(), "image/png")).toBe(1);
    const unrelated = new Uint8Array([
      255, 216, 255, 225, 0, 5, 120, 109, 112, 255, 217,
    ]);
    expect(mediaExifOrientation(unrelated, "image/jpeg")).toBe(1);
  });
  it("rejects malformed/ambiguous EXIF instead of guessing a crop orientation", () => {
    const mutations = [
      (t: Uint8Array) => (t[0] = 0),
      (t: Uint8Array) => (t[2] = 0),
      (t: Uint8Array) => new DataView(t.buffer).setUint32(4, 0xffffffff, true),
      (t: Uint8Array) => new DataView(t.buffer).setUint16(8, 65535, true),
      (t: Uint8Array) => new DataView(t.buffer).setUint16(12, 4, true),
      (t: Uint8Array) => new DataView(t.buffer).setUint32(14, 2, true),
      (t: Uint8Array) => new DataView(t.buffer).setUint16(18, 9, true),
    ];
    for (const mutate of mutations) {
      const tiff = orientationTiff(6);
      mutate(tiff);
      expect(() => mediaExifOrientation(webp(tiff), "image/webp")).toThrow(
        "unsupported_image",
      );
    }
    const tiff = orientationTiff(6);
    expect(() =>
      mediaExifOrientation(
        pngFixture(8, 6, {
          beforeData: [pngChunk("eXIf", tiff), pngChunk("eXIf", tiff)],
        }),
        "image/png",
      ),
    ).toThrow("unsupported_image");
    const duplicate = new Uint8Array(38);
    duplicate.set(tiff.subarray(0, 22));
    duplicate.set(tiff.subarray(10, 22), 22);
    new DataView(duplicate.buffer).setUint16(8, 2, true);
    expect(() => mediaExifOrientation(webp(duplicate), "image/webp")).toThrow(
      "unsupported_image",
    );
    expect(() =>
      mediaExifOrientation(orientationJpeg(6).subarray(0, 20), "image/jpeg"),
    ).toThrow("unsupported_image");
  });
  it("rejects metadata/display geometry disagreement and out-of-bounds rectangles", () => {
    expect(() =>
      encodedCropRectangle(
        { width: 8, height: 6 },
        { width: 8, height: 6 },
        { x: 1, y: 1, width: 2, height: 3 },
        6,
      ),
    ).toThrow("output_geometry");
    expect(() =>
      encodedCropRectangle(
        { width: 8, height: 6 },
        { width: 6, height: 8 },
        { x: 5, y: 1, width: 2, height: 3 },
        6,
      ),
    ).toThrow("output_geometry");
  });
});
