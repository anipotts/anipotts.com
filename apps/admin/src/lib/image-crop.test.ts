import { describe, expect, it } from "vitest";
import { imageCrop } from "./image-crop";

describe("photographic crops", () => {
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
