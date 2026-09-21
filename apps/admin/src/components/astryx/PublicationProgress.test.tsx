// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  PublicationProgress,
  publicationProgress,
} from "./PublicationProgress";
import type { PublishJob } from "../../editorial/publication-jobs";
import type {
  DirectPublicationStatus,
  PublicationStatus,
} from "../../lib/editorial-publication-status";

const job = (
  phase: PublishJob["phase"],
  blocked: string | null = null,
): PublishJob => ({
  id: "current",
  phase,
  blocked,
  version: 1,
  attempts: 1,
  dueAt: 0,
  lease: null,
  leaseUntil: 0,
  checkpoint: {},
});
const queued = (blocked: string | null = null): PublicationStatus => ({
  ...job("validate"),
  attempts: 0,
  canCancel: true,
  revision: 2,
  queue: {
    position: 2,
    pending: 2,
    alarmAt: blocked ? null : 1000,
    head: {
      ...job("validate", blocked),
      id: "earlier",
      sequence: 1,
      record: { kind: "work", id: "chainedchat" },
      revision: 2,
      createdAt: 0,
      cancelRequested: false,
    },
  },
});
function render(
  publication: PublishJob | PublicationStatus | DirectPublicationStatus,
  options: { compact?: boolean; stale?: boolean } = {},
) {
  return new DOMParser().parseFromString(
    renderToStaticMarkup(
      <PublicationProgress publication={publication} {...options} />,
    ),
    "text/html",
  );
}

describe("publication progress", () => {
  it("accepts old jobs without coordinator fields and distinguishes GitHub review from publication", () => {
    const progress = publicationProgress(job("checks"));
    expect(progress.message).toBe(
      "Content approved; waiting for GitHub checks and your PR review.",
    );
    expect(progress.steps.map((s) => s.state)).toEqual([
      "complete",
      "waiting",
      "upcoming",
      "upcoming",
    ]);
    expect(progress.isRunning).toBe(false);
    expect(
      render(job("checks")).querySelectorAll('[role="status"]'),
    ).toHaveLength(1);
  });

  it("only confirms live publication after verification", () => {
    expect(publicationProgress(job("verify")).message).toContain(
      "before confirming publication",
    );
    expect(
      publicationProgress(job("verify")).steps.map((s) => s.state),
    ).toEqual(["complete", "complete", "complete", "active"]);
    expect(
      publicationProgress(job("live")).steps.every(
        (s) => s.state === "complete",
      ),
    ).toBe(true);
    expect(publicationProgress(job("live")).message).toBe(
      "Your changes were verified on the live website.",
    );
    expect(publicationProgress(job("live")).isRunning).toBe(false);
  });

  it("explains an earlier paused job rather than claiming this record is being checked", () => {
    const publication = queued("unreleased_public_changes");
    const progress = publicationProgress(publication);
    expect(progress.message).toContain("Queued behind chainedchat");
    expect(progress.message).toContain(
      "deploy the reviewed website release, then retry",
    );
    expect(progress.steps[0].state).toBe("waiting");
    expect(progress.isRunning).toBe(false);
    const doc = render(publication, { compact: true });
    expect(doc.querySelector('[role="status"]')?.textContent).toBe(
      progress.message,
    );
    expect(doc.querySelector("a")?.getAttribute("href")).toBe(
      "/content/projects/chainedchat?panel=publication",
    );
    expect(doc.querySelector('[role="list"]')).toBeNull();
    expect(doc.querySelector('[data-pulsing="true"]')).toBeNull();
  });

  it("shows a queued job waiting its turn even if its own phase is validate", () => {
    const progress = publicationProgress(queued());
    expect(progress.message).toBe(
      "Queued behind chainedchat; your publication will start after it finishes.",
    );
    expect(progress.isRunning).toBe(false);
    expect(progress.steps[0].state).toBe("waiting");
  });

  it("shows an unclaimed first job as queued with no active animation", () => {
    const publication = { ...job("validate"), attempts: 0 };
    expect(publicationProgress(publication).message).toContain(
      "content checks have not started",
    );
    expect(publicationProgress(publication).steps[0].state).toBe("waiting");
    expect(publicationProgress(publication).isRunning).toBe(false);
  });

  it("keeps a paused first job blocked even when no attempt was claimed", () => {
    const publication = { ...job("validate", "stale_renderer"), attempts: 0 };
    expect(publicationProgress(publication).steps[0].state).toBe("blocked");
    expect(publicationProgress(publication).message).toContain(
      "admin release is out of date",
    );
  });

  it("does not treat a cancellation request as confirmed cancellation", () => {
    const publication = {
      ...queued(),
      checkpoint: { cancelRequested: "true" },
    };
    const progress = publicationProgress(publication);
    expect(progress.message).toContain("Stop requested");
    expect(progress.message).not.toContain("Publication stopped");
    expect(progress.blocker).toBeNull();
    expect(progress.isRunning).toBe(false);
  });

  it("keeps confirmed cancellation still and accurate when status becomes stale", () => {
    const progress = publicationProgress(job("cancelled"), true);
    expect(progress.message).toBe(
      "Publication stopped; your private draft is preserved.",
    );
    expect(progress.steps.every((s) => s.state === "stopped")).toBe(true);
    expect(progress.isRunning).toBe(false);
  });

  it("does not claim a stale live result is current or animate an unconfirmed status", () => {
    const live = publicationProgress(job("live"), true);
    expect(live.message).toContain("last confirmed result");
    expect(live.variant).toBe("warning");
    expect(live.steps[3].state).toBe("waiting");
    const active = publicationProgress(
      { ...job("commit"), lease: "lease" },
      true,
    );
    expect(active.message).toContain("before retrying");
    expect(active.isRunning).toBe(false);
    expect(active.steps[0].state).toBe("waiting");
  });

  it.each([
    ["stale_renderer", "deploy the compatible admin release"],
    ["base_changed", "review your draft against the latest website"],
    [
      "publication_base_changed",
      "review your draft against the latest website",
    ],
    ["record_changed", "compare your saved draft"],
    ["required_checks_failed", "open the checks, resolve the failure"],
    ["checks_failed", "open the checks, resolve the failure"],
    ["deployment_failed", "restore deployment"],
    ["release_content_mismatch", "retrying verification"],
  ])(
    "gives specific remediation for %s without surfacing machine codes",
    (code, expected) => {
      const progress = publicationProgress(job("checks", code));
      expect(progress.message).toContain(expected);
      expect(progress.message).not.toContain(code);
      expect(progress.steps[1].state).toBe("blocked");
      expect(progress.isRunning).toBe(false);
    },
  );

  it("does not display unknown provider error content or unsafe checkpoint destinations", () => {
    const publication = {
      ...job("checks", "private_provider_body?token=secret"),
      checkpoint: { prNumber: "123/../../unexpected?secret=value" },
    };
    const doc = render(publication);
    expect(doc.body.textContent).toContain("publisher needs investigation");
    expect(doc.body.textContent).not.toContain("secret");
    expect(doc.querySelector("a")).toBeNull();
  });

  it("links only valid blocking record identities and supported collections", () => {
    const publication = queued("stale_renderer");
    publication.queue.head!.record = {
      kind: "writing",
      id: "../../settings?token=secret",
    };
    const progress = publicationProgress(publication);
    expect(progress.blocker).toBeNull();
    expect(progress.message).not.toContain("secret");
    expect(render(publication).querySelector("a")).toBeNull();
    publication.queue.head!.record = { kind: "page", id: "writing" };
    expect(publicationProgress(publication).blocker?.href).toBe(
      "/content/writingPage/writing?panel=publication",
    );
  });

  it("only animates a confirmed current lease, not a phase sitting in backoff", () => {
    expect(publicationProgress(job("commit")).isRunning).toBe(false);
    expect(
      publicationProgress({ ...job("commit"), lease: "active-lease" })
        .isRunning,
    ).toBe(true);
    expect(
      publicationProgress({ ...job("checks"), lease: "active-lease" })
        .isRunning,
    ).toBe(false);
  });
});

const direct = (
  phase: PublishJob["phase"],
  overrides: Partial<DirectPublicationStatus> = {},
): DirectPublicationStatus => {
  const activated = phase === "verify" || phase === "live";
  return {
    ...job(phase),
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
      position: activated ? null : 1,
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
    const progress = publicationProgress(direct("commit", { lease: "lease" }));
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
    const progress = publicationProgress(direct("verify", { lease: "lease" }));
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
    ["legacy_effects_pending", "resolve its recorded effects"],
    [
      "legacy_publication_requires_reconciliation",
      "resolve its recorded effects",
    ],
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

  it("never falls back to the legacy flow for an unexpected direct phase", () => {
    const progress = publicationProgress(direct("checks", { lease: "lease" }));
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
