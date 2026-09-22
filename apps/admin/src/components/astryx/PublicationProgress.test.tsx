// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PublicationProgress,
  publicationProgress,
} from "./PublicationProgress";
import type { DirectPublicationStatus } from "../../lib/editorial-publication-status";

function render(
  publication: DirectPublicationStatus,
  options: { compact?: boolean; stale?: boolean } = {},
) {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(
      <PublicationProgress publication={publication} {...options} />,
    ),
    "text/html",
  );
}

const direct = (
  phase: DirectPublicationStatus["phase"],
  overrides: Partial<DirectPublicationStatus> = {},
): DirectPublicationStatus => {
  const activated = phase === "verify" || phase === "live";
  return {
    id: "current",
    phase,
    blocked: null,
    version: 1,
    attempts: 1,
    dueAt: 0,
    lease: null,
    leaseUntil: 0,
    checkpoint: {},
    mode: "direct",
    revision: 2,
    sourceSha256: "a".repeat(64),
    baselineSha256: "b".repeat(64),
    publicationId: activated ? "published-current" : null,
    inventoryVersion: activated ? 3 : null,
    verifiedAt: phase === "live" ? 1000 : null,
    superseded: false,
    canCancel: !activated,
    queue: {
      position: null,
      pending: activated ? 0 : 1,
      head: null,
      alarmAt: null,
    },
    ...overrides,
  };
};

describe("direct CMS publication progress", () => {
  it("shows only the actual direct publication stages and never a historical review link", () => {
    const publication = direct("validate", { checkpoint: { prNumber: "123" } });
    const progress = publicationProgress(publication);
    expect(progress.steps.map((step) => step.label)).toEqual([
      "Prepare",
      "Publish",
      "Verify",
    ]);
    expect(progress.message).toBe(
      "Preparing your reviewed changes for publication.",
    );
    const doc = render(publication);
    expect(doc.body.textContent).not.toMatch(/GitHub|pull request|deploy/i);
    expect(doc.querySelector("a")).toBeNull();
    expect(doc.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it("does not animate an unclaimed direct intent", () => {
    const progress = publicationProgress(direct("validate", { attempts: 0 }));
    expect(progress.message).toContain("preparation has not started");
    expect(progress.steps.map((step) => step.state)).toEqual([
      "waiting",
      "upcoming",
      "upcoming",
    ]);
    expect(progress.isRunning).toBe(false);
  });

  it("distinguishes preparing activation from an acknowledged public effect", () => {
    const progress = publicationProgress(
      direct("commit", { lease: "lease", leaseUntil: Date.now() + 60_000 }),
    );
    expect(progress.message).toBe("Publishing your approved changes.");
    expect(progress.steps.map((step) => step.state)).toEqual([
      "complete",
      "active",
      "upcoming",
    ]);
    expect(progress.isRunning).toBe(true);
  });

  it("acknowledges publication as soon as its receipt exists, before verification starts", () => {
    const progress = publicationProgress(
      direct("commit", {
        publicationId: "receipt",
        inventoryVersion: 3,
        lease: "lease",
        leaseUntil: Date.now() + 60_000,
      }),
    );
    expect(progress.message).toBe("Published. Website verification is next.");
    expect(progress.steps.map((step) => step.state)).toEqual([
      "complete",
      "complete",
      "waiting",
    ]);
    expect(progress.isRunning).toBe(false);
  });

  it("keeps publication and live verification as separate facts", () => {
    const progress = publicationProgress(
      direct("verify", { lease: "lease", leaseUntil: Date.now() + 60_000 }),
    );
    expect(progress.message).toBe(
      "Published. Checking the website before confirming it is live.",
    );
    expect(progress.steps.map((step) => step.state)).toEqual([
      "complete",
      "complete",
      "active",
    ]);
    const live = publicationProgress(direct("live"));
    expect(live.message).toBe(
      "Your changes were verified on the live website.",
    );
    expect(live.steps.every((step) => step.state === "complete")).toBe(true);
    expect(live.variant).toBe("success");
    expect(live.isRunning).toBe(false);
  });

  it("explains supersession without claiming the older content is currently live", () => {
    const progress = publicationProgress(
      direct("live", {
        superseded: true,
        verifiedAt: null,
        lease: "old-lease",
      }),
    );
    expect(progress.message).toContain(
      "A newer publication has replaced these changes",
    );
    expect(progress.variant).toBe("neutral");
    expect(progress.steps.map((step) => step.state)).toEqual([
      "complete",
      "complete",
      "stopped",
    ]);
    expect(progress.isRunning).toBe(false);
  });

  it("retains activation truth when verification is blocked or current status is unavailable", () => {
    const blocked = publicationProgress(
      direct("verify", { blocked: "verification_incomplete" }),
    );
    expect(blocked.message).toContain(
      "Published, but website verification is incomplete",
    );
    expect(blocked.message).toContain("without publishing another copy");
    expect(blocked.steps.map((step) => step.state)).toEqual([
      "complete",
      "complete",
      "blocked",
    ]);
    expect(blocked.variant).toBe("warning");
    const stale = publicationProgress(
      direct("verify", { lease: "old-lease" }),
      true,
    );
    expect(stale.message).toContain(
      "Published; current website verification is unavailable",
    );
    expect(stale.steps.map((step) => step.state)).toEqual([
      "complete",
      "complete",
      "waiting",
    ]);
    expect(stale.isRunning).toBe(false);
  });

  it("does not upgrade stale historical verification into current confirmation", () => {
    const progress = publicationProgress(direct("live"), true);
    expect(progress.message).toContain("previously verified live");
    expect(progress.variant).toBe("warning");
    expect(progress.steps[2].state).toBe("waiting");
  });

  it.each([
    ["baseline_changed", "compare your saved draft with the latest content"],
    ["publication_conflict", "review again"],
    [
      "reader_not_ready",
      "restore the compatible website reader, then retry publishing",
    ],
    ["public_reader_not_ready", "restore the compatible website reader"],
    ["unsupported_slug_change", "restore the current URL in the draft"],
    ["unsupported_visibility_change", "keep the current visibility"],
    ["publisher_not_configured", "restore the publication storage connections"],
    ["media_missing", "restore or replace it"],
    ["media_invalid", "check the image in the draft"],
    ["media_limit", "publication limit"],
    ["publication_image_missing", "restore or replace it"],
    ["publication_image_corrupt", "check the image in the draft"],
    ["publication_image_copy_failed", "retry when storage recovers"],
    ["publication_images_too_large", "reduce the affected content"],
    ["too_many_images", "publication limit"],
    ["publication_receipt_missing", "confirm its recorded effects"],
    [
      "publication_retry_required",
      "automatic publication attempts have stopped",
    ],
  ])("gives bounded recovery guidance for %s", (code, recovery) => {
    const progress = publicationProgress(direct("validate", { blocked: code }));
    expect(progress.message).toContain(recovery);
    expect(progress.message).not.toContain(code);
    expect(progress.message).not.toMatch(/GitHub|pull request|deploy/i);
    expect(progress.steps[0].state).toBe("blocked");
    expect(progress.isRunning).toBe(false);
  });

  it("never prints a raw direct publisher error or a historical provider link", () => {
    const publication = direct("commit", {
      blocked: "private error?token=secret",
      checkpoint: { prNumber: "123" },
    });
    const doc = render(publication, { compact: true });
    expect(doc.body.textContent).toContain("publisher needs investigation");
    expect(doc.body.textContent).not.toMatch(
      /secret|GitHub|pull request|deploy/i,
    );
    expect(doc.querySelector("a")).toBeNull();
  });

  it("treats an unexpected phase as needing reconciliation", () => {
    const progress = publicationProgress(
      direct("checks" as DirectPublicationStatus["phase"], {
        lease: "lease",
        leaseUntil: Date.now() + 60_000,
      }),
    );
    expect(progress.message).toContain("needs reconciliation");
    expect(progress.message).not.toMatch(/GitHub|pull request|deploy/i);
    expect(progress.isRunning).toBe(false);
    expect(progress.variant).toBe("warning");
  });

  it("does not claim live verification from a phase without its proof", () => {
    const noVerification = publicationProgress(
      direct("live", { verifiedAt: null }),
    );
    expect(noVerification.message).toBe(
      "Published; website verification still needs confirmation.",
    );
    expect(noVerification.steps[2].state).toBe("waiting");
    expect(noVerification.variant).toBe("warning");
    const noReceipt = publicationProgress(
      direct("live", { publicationId: null }),
    );
    expect(noReceipt.message).toContain("before confirming a public result");
    expect(noReceipt.variant).toBe("warning");
    expect(noReceipt.steps[1].state).toBe("waiting");
  });

  it("does not describe a recorded public effect as unpublished after cancellation", () => {
    const stopped = publicationProgress(direct("cancelled"));
    expect(stopped.message).toBe(
      "Publication stopped; your private draft is preserved.",
    );
    expect(stopped.steps.every((step) => step.state === "stopped")).toBe(true);
    const activated = publicationProgress(
      direct("cancelled", { publicationId: "receipt", inventoryVersion: 3 }),
    );
    expect(activated.message).toBe(
      "Published; verification was stopped. Your private draft is preserved.",
    );
    expect(activated.steps.map((step) => step.state)).toEqual([
      "complete",
      "complete",
      "stopped",
    ]);
    expect(activated.isRunning).toBe(false);
  });
});

it("does not animate expired or malformed leases as active publication work", () => {
  const publication = direct("commit");
  for (const leaseUntil of [0, 999, 1000, Number.NaN, Infinity]) {
    expect(
      publicationProgress(
        { ...publication, lease: "retained", leaseUntil },
        false,
        1000,
      ).isRunning,
    ).toBe(false);
  }
  expect(
    publicationProgress(
      { ...publication, lease: "current", leaseUntil: 1001 },
      false,
      1000,
    ).isRunning,
  ).toBe(true);
});
