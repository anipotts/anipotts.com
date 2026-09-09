import { describe, expect, it } from "vitest";
import { publicationProgress } from "./PublicationProgress";
import type { PublishJob } from "../../editorial/publication-jobs";
const job = (
  phase: PublishJob["phase"],
  blocked: string | null = null,
): PublishJob => ({
  id: "test",
  phase,
  blocked,
  version: 1,
  attempts: 0,
  dueAt: 0,
  lease: null,
  leaseUntil: 0,
  checkpoint: {},
});
describe("publication progress", () => {
  it("does not claim deployment or live verification before confirmation", () => {
    expect(
      publicationProgress(job("checks")).steps.map((s) => s.state),
    ).toEqual(["complete", "active", "upcoming", "upcoming"]);
    expect(
      publicationProgress(job("verify")).steps.map((s) => s.state),
    ).toEqual(["complete", "complete", "complete", "active"]);
    expect(
      publicationProgress(job("live")).steps.every(
        (s) => s.state === "complete",
      ),
    ).toBe(true);
  });
  it("stops active motion when blocked, cancelled, or disconnected", () => {
    expect(
      publicationProgress(job("checks", "checks_failed")).steps[1].state,
    ).toBe("blocked");
    expect(publicationProgress(job("checks"), true).steps[1].state).toBe(
      "waiting",
    );
    expect(
      publicationProgress(job("cancelled")).steps.every(
        (s) => s.state === "stopped",
      ),
    ).toBe(true);
  });
});
