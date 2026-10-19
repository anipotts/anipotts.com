import { describe, expect, it } from "vitest";
import { cropOutputSize, imageCrop } from "../lib/image-crop";
import { MAX_MEDIA_BYTES, MAX_MEDIA_PIXELS } from "./media-store";
import {
  mediaCropProvenance,
  parseMediaCropPlan,
  parseMediaCropProvenance,
  planMediaCrop,
} from "./media-processing-plan";
const parent = {
  id: `${"a".repeat(64)}.jpg`,
  type: "image/jpeg" as const,
  size: 1024,
};
const output = {
  id: `${"b".repeat(64)}.png`,
  type: "image/png" as const,
  size: 2048,
};
const intent = { ratio: 16 / 9, zoom: 1, x: 50, y: 50 };

describe("source-only crop and provenance contracts", () => {
  it("reuses browser selection and output sizing with explicit contained integer quantization", () => {
    for (const source of [
      { width: 4096, height: 4096 },
      { width: 12000, height: 1000 },
      { width: 1, height: 1 },
    ])
      for (const ratio of [1, 1.5, 16 / 9, 2.4])
        for (const zoom of [1, 2, 3])
          for (const x of [0, 50, 100]) {
            const request = { ratio, zoom, x, y: x };
            const plan = planMediaCrop(source, request);
            expect(plan.selected).toEqual(
              imageCrop(source.width, source.height, ratio, zoom, x, x),
            );
            expect(plan.effective.x).toBeLessThanOrEqual(plan.selected.x);
            expect(plan.effective.y).toBeLessThanOrEqual(plan.selected.y);
            expect(
              plan.effective.x + plan.effective.width,
            ).toBeGreaterThanOrEqual(
              plan.selected.x + plan.selected.width - 1e-8,
            );
            expect(
              plan.effective.y + plan.effective.height,
            ).toBeLessThanOrEqual(source.height);
            expect(Object.values(plan.effective).every(Number.isInteger)).toBe(
              true,
            );
            expect(plan.output).toEqual(
              cropOutputSize(plan.effective.width, plan.effective.height),
            );
            expect(
              Math.max(plan.output.width, plan.output.height),
            ).toBeLessThanOrEqual(2560);
            expect(
              (plan.output.width * 4 + 1) * plan.output.height + 65536,
            ).toBeLessThan(MAX_MEDIA_BYTES);
            expect(parseMediaCropPlan(plan)).toEqual(plan);
          }
  });
  it("retains the current original admission constants, rejects over-limit geometry and non-finite intent", () => {
    expect(MAX_MEDIA_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_MEDIA_PIXELS).toBe(16 * 1024 * 1024);
    for (const source of [
      { width: 4097, height: 4096 },
      { width: 16385, height: 1 },
      { width: 0, height: 1 },
    ])
      expect(() => planMediaCrop(source, intent)).toThrow("invalid_crop");
    for (const bad of [
      { ...intent, zoom: 0 },
      { ...intent, ratio: NaN },
      { ...intent, x: Infinity },
      { ...intent, ratio: 1e-320 },
    ])
      expect(() => planMediaCrop({ width: 100, height: 100 }, bad)).toThrow(
        "invalid_crop",
      );
  });
  it("rejects unknown fields, unsupported versions, unsafe keys and inconsistent derived plan fields", () => {
    const plan = planMediaCrop({ width: 100, height: 100 }, intent);
    for (const bad of [
      { ...plan, extra: true },
      { ...plan, version: "later" },
      { ...plan, output: { width: 1, height: 1 } },
      { ...plan, requested: { ...intent, __proto__: null, hidden: true } },
      { ...plan, effective: { ...plan.effective, x: -1 } },
    ])
      expect(() => parseMediaCropPlan(bad)).toThrow("invalid_crop");
    const reordered = {
      quantization: plan.quantization,
      output: { height: plan.output.height, width: plan.output.width },
      effective: {
        height: plan.effective.height,
        width: plan.effective.width,
        y: plan.effective.y,
        x: plan.effective.x,
      },
      selected: {
        height: plan.selected.height,
        width: plan.selected.width,
        y: plan.selected.y,
        x: plan.selected.x,
      },
      requested: {
        y: plan.requested.y,
        x: plan.requested.x,
        zoom: plan.requested.zoom,
        ratio: plan.requested.ratio,
      },
      source: { height: 100, width: 100 },
      version: plan.version,
    };
    expect(parseMediaCropPlan(reordered)).toEqual(plan);
    expect(() =>
      parseMediaCropPlan({
        ...plan,
        source: JSON.parse(
          '{"width":100,"height":100,"__proto__":{"polluted":true}}',
        ),
      }),
    ).toThrow("invalid_crop");
  });
  it("separates stable intent identity from provider output identity and claims no encoder version", () => {
    const plan = planMediaCrop({ width: 100, height: 100 }, intent);
    const first = mediaCropProvenance(parent, plan, output);
    const second = mediaCropProvenance(parent, plan, {
      ...output,
      id: `${"c".repeat(64)}.png`,
    });
    expect(first.intentId).toBe(second.intentId);
    expect(first.id).not.toBe(second.id);
    expect(first.encoderVersion).toBeNull();
    expect(first.evidence).toBe("provider-transcode-completed");
    expect(parseMediaCropProvenance(first)).toEqual(first);
    const changed = structuredClone(first);
    changed.plan.output.width++;
    expect(() => parseMediaCropProvenance(changed)).toThrow();
    for (const bad of [
      { ...first, extra: 1 },
      { ...first, id: "0".repeat(64) },
      { ...first, parent: { ...parent, size: MAX_MEDIA_BYTES + 1 } },
      { ...first, output: { ...output, type: "image/jpeg" } },
      { ...first, provider: "other" },
      { ...first, encoderVersion: "invented" },
    ])
      expect(() => parseMediaCropProvenance(bad)).toThrow();
  });
});
