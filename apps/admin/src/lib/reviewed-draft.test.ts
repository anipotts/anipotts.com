import { describe, expect, it } from "vitest";
import { captureReviewedDraft, matchesReviewedDraft } from "./reviewed-draft";
import type { SaveState } from "./home-autosave";
const saved: SaveState = {
  source: "Acknowledged source",
  revision: 3,
  status: "saved",
  conflict: null,
};
describe("reviewed draft identity", () => {
  it("captures only a successful stored revision", () => {
    expect(captureReviewedDraft(saved)).toEqual({
      source: saved.source,
      revision: 3,
    });
    expect(captureReviewedDraft(null)).toBeNull();
    for (const status of ["unsaved", "saving", "conflict"] as const)
      expect(captureReviewedDraft({ ...saved, status })).toBeNull();
    for (const revision of [0, -1, 1.5, Infinity, NaN])
      expect(captureReviewedDraft({ ...saved, revision })).toBeNull();
    expect(captureReviewedDraft({ ...saved, saveFailed: true })).toBeNull();
  });
  it("requires exact source, revision and saved status", () => {
    const review = captureReviewedDraft(saved);
    expect(matchesReviewedDraft(review, saved)).toBe(true);
    expect(
      matchesReviewedDraft(review, { ...saved, source: "Later typing" }),
    ).toBe(false);
    expect(matchesReviewedDraft(review, { ...saved, revision: 4 })).toBe(false);
    expect(matchesReviewedDraft(review, { ...saved, status: "saving" })).toBe(
      false,
    );
    expect(matchesReviewedDraft(null, saved)).toBe(false);
    expect(matchesReviewedDraft(review, null)).toBe(false);
  });
  it("does not mutate the captured review when the controller changes", () => {
    const current = { ...saved };
    const review = captureReviewedDraft(current);
    current.revision = 4;
    current.source = "Changed";
    expect(review).toEqual({ source: saved.source, revision: 3 });
    expect(matchesReviewedDraft(review, current)).toBe(false);
  });
});
