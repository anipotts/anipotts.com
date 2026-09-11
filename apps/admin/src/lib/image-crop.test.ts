import { describe, expect, it } from "vitest";
import { cropOutputSize, imageCrop } from "./image-crop";

describe("photographic crops", () => {
  it("bounds large phone photos while preserving smaller original pixels", () => {
    expect(cropOutputSize(1179, 663)).toEqual({ width: 1179, height: 663 });
    for (const [width, height] of [
      [8064, 6048],
      [4032, 3024],
      [12000, 1000],
      [1000, 12000],
    ]) {
      const result = cropOutputSize(width!, height!);
      expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(2560);
      // Includes scanline filter bytes and ample deflate/PNG overhead headroom.
      expect((result.width * 4 + 1) * result.height + 65536).toBeLessThan(
        10 * 1024 * 1024,
      );
      expect(result.width / result.height).toBeCloseTo(width! / height!, 1);
    }
  });
  it("keeps every crop inside portrait and landscape originals at every edge", () => {
    for (const [width, height] of [
      [1179, 2091],
      [2400, 1600],
    ])
      for (const ratio of [1, 1.5, 16 / 9])
        for (const zoom of [1, 2, 3])
          for (const x of [0, 50, 100])
            for (const y of [0, 50, 100]) {
              const crop = imageCrop(width!, height!, ratio, zoom, x, y);
              expect(crop.x).toBeGreaterThanOrEqual(0);
              expect(crop.y).toBeGreaterThanOrEqual(0);
              expect(crop.x + crop.width).toBeLessThanOrEqual(width! + 1e-8);
              expect(crop.y + crop.height).toBeLessThanOrEqual(height! + 1e-8);
              expect(crop.width / crop.height).toBeCloseTo(ratio);
            }
  });
  it("rejects invalid geometry instead of producing a blank image", () => {
    expect(() => imageCrop(0, 200, 1, 1, 50, 50)).toThrow();
    expect(() => imageCrop(200, 200, 1, 0, 50, 50)).toThrow();
    expect(() => imageCrop(200, 200, NaN, 1, 50, 50)).toThrow();
  });
});
