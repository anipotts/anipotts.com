import React from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Button } from "@astryxdesign/core/Button";
import { CheckIcon, PauseIcon, WarningIcon } from "@phosphor-icons/react";
import type {
  PublishJob,
  PublishPhase,
} from "../../editorial/publication-jobs";
import type {
  DirectPublicationStatus,
  PublicationStatus,
} from "../../lib/editorial-publication-status";
import { recordWorkspaceUrl } from "../../lib/record-workspace-state";

/** Older tabs and servers may still return a job without coordinator context. */
type LegacyProgressJob = PublishJob &
  Partial<Pick<PublicationStatus, "queue" | "canCancel">> & { mode?: "legacy" };
type ProgressJob = LegacyProgressJob | DirectPublicationStatus;

const stageIndex: Record<PublishPhase, number> = {
  validate: 0,
  commit: 0,
  branch: 0,
  pr: 1,
  checks: 1,
  deploy: 2,
  verify: 3,
  live: 3,
  cancelled: -1,
};
const phaseLabels: Record<PublishPhase, string> = {
  validate: "Checking the reviewed content before publication.",
  commit: "Preparing the reviewed content for publication.",
  branch: "Preparing the publication branch.",
  pr: "Opening the publication pull request for review.",
  checks: "Content approved; waiting for GitHub checks and your PR review.",
  deploy: "Deploying the approved changes to the website.",
  verify:
    "Deployment finished; checking the live website before confirming publication.",
  live: "Your changes were verified on the live website.",
  cancelled: "Publication stopped; your private draft is preserved.",
};
const stages = ["Prepare", "GitHub review", "Deploy", "Verify"];
type StepState =
  "stopped" | "complete" | "upcoming" | "blocked" | "waiting" | "active";

/** Never render arbitrary provider errors, URLs or diagnostic payloads. */
function pauseReason(code: string): string {
  switch (code) {
    case "unreleased_public_changes":
      return "website code is awaiting deployment; deploy the reviewed website release, then retry";
    case "stale_renderer":
      return "the admin release is out of date; deploy the compatible admin release, then retry";
    case "base_changed":
    case "publication_base_changed":
      return "the website changed; stop this publication and review your draft against the latest website";
    case "record_changed":
    case "record_removed":
    case "record_already_exists":
      return "this record changed on the website; stop this publication and compare your saved draft before reviewing again";
    case "checks_failed":
    case "required_checks_failed":
      return "GitHub checks failed; open the checks, resolve the failure, then retry";
    case "deployment_failed":
      return "deployment failed; inspect the failed release and restore deployment before retrying";
    case "release_content_mismatch":
      return "the live website does not match the approved content; check the deployed release before retrying verification";
    case "release_verification_not_configured":
      return "live verification is not configured; restore the verification service before retrying";
    case "publication_hold":
      return "publishing is on hold; resume the reviewed release process before retrying";
    case "publication_closed":
      return "the publication pull request was closed; stop this publication and review your draft again";
    case "unauthorized":
      return "the publisher cannot access GitHub; restore its authorized connection before retrying";
    case "release_unavailable":
      return "release status is unavailable; wait for the release service to recover, then retry";
    case "invalid_content":
    case "invalid_publication_media":
    case "snapshot_too_large":
      return "the content or its media could not be validated; stop this publication and check your draft before reviewing again";
    default:
      return "the publisher needs investigation; keep your draft and check the publication before retrying";
  }
}

function blockingRecord(job: LegacyProgressJob) {
  const head = job.queue?.head;
  if (!head || head.id === job.id || !head.record) return null;
  const { kind, id } = head.record;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) || id.length > 120) return null;
  const pageCollections: Record<string, string> = {
    home: "home",
    work: "workPage",
    writing: "writingPage",
    systems: "systemsPage",
    newsletter: "newsletterPage",
  };
  const collection =
    kind === "writing"
      ? "writing"
      : kind === "work"
        ? "projects"
        : kind === "page"
          ? pageCollections[id]
          : undefined;
  if (!collection) return null;
  return {
    name: id,
    href: recordWorkspaceUrl(
      `/content/${collection}/${encodeURIComponent(id)}`,
      "",
      { view: "edit", panel: "publication" },
    ),
  };
}

export function publicationProgress(
  job: ProgressJob,
  stale = false,
  now = Date.now(),
) {
  if (job.mode === "direct") return directPublicationProgress(job, stale, now);
  const stopped = job.phase === "cancelled";
  const complete = job.phase === "live" && !job.blocked;
  const cancelling =
    !stopped && !complete && job.checkpoint.cancelRequested === "true";
  const queued = !stopped && !complete && (job.queue?.position ?? 0) > 1;
  const unclaimed =
    job.phase === "validate" && job.attempts === 0 && !job.lease;
  const head = job.queue?.head;
  const blocker = queued ? blockingRecord(job) : null;
  const active = stageIndex[job.phase];
  const message = stopped
    ? phaseLabels.cancelled
    : stale
      ? complete
        ? "Publication status is unavailable; live verification was the last confirmed result."
        : "Publication status is unavailable; reconnect before retrying or assuming it has stopped."
      : cancelling
        ? "Stop requested; waiting for the publisher to confirm any work already completed."
        : queued
          ? head?.blocked
            ? `Queued behind ${blocker?.name ?? "an earlier publication"}: ${pauseReason(head.blocked)}.`
            : `Queued behind ${blocker?.name ?? "an earlier publication"}; your publication will start after it finishes.`
          : job.blocked
            ? `Publication paused: ${pauseReason(job.blocked)}.`
            : unclaimed
              ? "Publication queued; content checks have not started."
              : phaseLabels[job.phase];
  const waiting =
    stale || cancelling || queued || unclaimed || job.phase === "checks";
  return {
    message,
    blocker: stale || cancelling ? null : blocker,
    variant: (stopped
      ? "neutral"
      : stale
        ? "warning"
        : complete
          ? "success"
          : job.blocked || (queued && head?.blocked)
            ? "error"
            : waiting
              ? "neutral"
              : "accent") as
      "neutral" | "warning" | "success" | "error" | "accent",
    // A phase alone does not prove active work: jobs can be queued or in backoff.
    isRunning:
      !stopped &&
      !complete &&
      !waiting &&
      !job.blocked &&
      Boolean(job.lease) &&
      Number.isFinite(job.leaseUntil) &&
      job.leaseUntil > now,
    steps: stages.map((label, index): { label: string; state: StepState } => {
      if (stopped) return { label, state: "stopped" };
      if ((complete && !stale) || index < active)
        return { label, state: "complete" };
      if (index > active) return { label, state: "upcoming" };
      if (stale || cancelling || queued) return { label, state: "waiting" };
      if (job.blocked) return { label, state: "blocked" };
      return {
        label,
        state: unclaimed || job.phase === "checks" ? "waiting" : "active",
      };
    }),
  };
}

/** Direct publication status must never inherit historical Git review language. */
function directPauseReason(code: string, activated: boolean): string {
  switch (code) {
    case "baseline_changed":
    case "publication_base_changed":
    case "publication_conflict":
      return "the website changed since this review; compare your saved draft with the latest content and review again";
    case "reader_not_ready":
    case "public_reader_not_ready":
      return `the website cannot read this publication yet; restore the compatible website reader, then retry ${activated ? "verification" : "publishing"}`;
    case "legacy_effects_pending":
    case "legacy_publication_requires_reconciliation":
      return "an earlier publication needs reconciliation; resolve its recorded effects before continuing";
    case "publication_image_missing":
    case "media_missing":
    case "media_not_found":
      return "a referenced image is unavailable; restore or replace it in the draft, then review again";
    case "publication_image_corrupt":
    case "media_invalid":
    case "media_hash_mismatch":
    case "invalid_publication_media":
      return "a referenced image failed validation; check the image in the draft, then review again";
    case "publication_image_copy_failed":
    case "media_unavailable":
    case "media_copy_failed":
    case "media_storage_unavailable":
      return "image storage is unavailable; keep the draft and retry when storage recovers";
    case "publication_images_too_large":
    case "too_many_images":
    case "media_too_large":
    case "media_limit":
    case "snapshot_too_large":
      return "the content or its images exceed the publication limit; reduce the affected content and review again";
    case "verification_failed":
    case "verification_incomplete":
    case "public_content_mismatch":
      return "the website has not confirmed this version; retry verification without publishing another copy";
    case "invalid_snapshot":
    case "invalid_content":
    case "invalid_source":
      return "the draft could not be validated; correct the marked fields and review again";
    case "idempotency_conflict":
    case "publication_receipt_missing":
      return "the publication receipt needs reconciliation; confirm its recorded effects before starting another publication";
    case "publication_retry_required":
      return "automatic publication attempts have stopped; check the recorded status and retry when the service is available";
    case "unsupported_slug_change":
      return "URL changes are not available yet; restore the current URL in the draft and review again";
    case "unsupported_visibility_change":
      return "visibility changes need a separate reviewed action; keep the current visibility and review these edits again";
    case "publisher_not_configured":
      return "publishing is unavailable in this environment; restore the publication storage connections before retrying";
    case "publication_unavailable":
    case "storage_unavailable":
      return "publication storage is unavailable; check the recorded status before retrying";
    default:
      return "the publisher needs investigation; preserve the draft and check the recorded status before retrying";
  }
}

function directPublicationProgress(
  job: DirectPublicationStatus,
  stale: boolean,
  now: number,
) {
  const activated = Boolean(job.publicationId);
  const superseded = job.superseded;
  const stopped = job.phase === "cancelled";
  const verified =
    activated && job.phase === "live" && job.verifiedAt != null && !job.blocked;
  const cancelling =
    !stopped && !verified && job.checkpoint.cancelRequested === "true";
  const supportedPhase = [
    "validate",
    "commit",
    "verify",
    "live",
    "cancelled",
  ].includes(job.phase);
  const missingReceipt = !activated && ["verify", "live"].includes(job.phase);
  const incompleteVerification = job.phase === "live" && !verified;
  const uncertain =
    stale || missingReceipt || incompleteVerification || !supportedPhase;
  const unclaimed =
    job.phase === "validate" && job.attempts === 0 && !job.lease;
  const active = activated ? 2 : job.phase === "validate" ? 0 : 1;
  const message = superseded
    ? "A newer publication has replaced these changes. Your private revision is preserved."
    : stopped
      ? activated
        ? "Published; verification was stopped. Your private draft is preserved."
        : "Publication stopped; your private draft is preserved."
      : stale
        ? verified
          ? "These changes were previously verified live. Current publication status is unavailable."
          : activated
            ? "Published; current website verification is unavailable. Check the recorded status before retrying."
            : "Publication status is unavailable. Check the recorded status before retrying or assuming it has stopped."
        : cancelling
          ? activated
            ? "Published. Confirming the remaining work before stopping."
            : "Stop requested. Checking whether publication already completed."
          : job.blocked
            ? `${activated ? "Published, but website verification is incomplete" : "Publication needs attention"}: ${directPauseReason(job.blocked, activated)}.`
            : uncertain
              ? activated
                ? "Published; website verification still needs confirmation."
                : "Publication status needs reconciliation before confirming a public result."
              : verified
                ? "Your changes were verified on the live website."
                : activated
                  ? job.phase === "verify"
                    ? "Published. Checking the website before confirming it is live."
                    : "Published. Website verification is next."
                  : unclaimed
                    ? "Publication queued; preparation has not started."
                    : job.phase === "validate"
                      ? "Preparing your reviewed changes for publication."
                      : "Publishing your approved changes.";
  const waiting =
    uncertain ||
    cancelling ||
    unclaimed ||
    (activated && job.phase !== "verify");
  return {
    message,
    blocker: null,
    variant: (superseded || stopped
      ? "neutral"
      : uncertain
        ? "warning"
        : verified
          ? "success"
          : job.blocked
            ? activated
              ? "warning"
              : "error"
            : waiting
              ? "neutral"
              : "accent") as
      "neutral" | "warning" | "success" | "error" | "accent",
    isRunning:
      !superseded &&
      !stopped &&
      !verified &&
      !waiting &&
      !job.blocked &&
      Boolean(job.lease) &&
      Number.isFinite(job.leaseUntil) &&
      job.leaseUntil > now,
    steps: ["Prepare", "Publish", "Verify"].map(
      (label, index): { label: string; state: StepState } => {
        if (superseded || stopped)
          return {
            label,
            state:
              activated && (index < 2 || verified) ? "complete" : "stopped",
          };
        if ((verified && !uncertain) || index < active)
          return { label, state: "complete" };
        if (index > active) return { label, state: "upcoming" };
        if (job.blocked && !stale) return { label, state: "blocked" };
        if (waiting || (activated && job.phase !== "verify"))
          return { label, state: "waiting" };
        return { label, state: "active" };
      },
    ),
  };
}

export function PublicationProgress({
  publication,
  stale = false,
  compact = false,
  children,
}: {
  publication: ProgressJob;
  stale?: boolean;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const progress = publicationProgress(publication, stale);
  const prNumber = publication.checkpoint.prNumber;
  const hasPullRequest =
    publication.mode !== "direct" &&
    typeof prNumber === "string" &&
    /^[1-9][0-9]{0,9}$/u.test(prNumber);
  return (
    <VStack
      gap={3}
      paddingBlock={compact ? 0 : 3}
      className="publication-progress"
      data-compact={compact ? "true" : undefined}
      role="region"
      aria-label="Publication progress"
    >
      {!compact && (
        <HStack
          gap={3}
          wrap="wrap"
          className="publication-steps"
          role="list"
          aria-label="Publishing steps"
        >
          {progress.steps.map(({ label, state }) => (
            <HStack
              key={label}
              gap={2}
              vAlign="center"
              className="publication-step"
              data-state={state}
              role="listitem"
              aria-current={
                state === "active" || state === "waiting" || state === "blocked"
                  ? "step"
                  : undefined
              }
            >
              <StatusDot
                variant={
                  state === "complete"
                    ? "success"
                    : state === "blocked"
                      ? "error"
                      : state === "waiting"
                        ? "warning"
                        : state === "active"
                          ? "accent"
                          : "neutral"
                }
                label={`${label}: ${state}`}
                isPulsing={progress.isRunning && state === "active"}
                icon={
                  state === "complete" ? (
                    <CheckIcon />
                  ) : state === "blocked" ? (
                    <WarningIcon />
                  ) : state === "stopped" || state === "waiting" ? (
                    <PauseIcon />
                  ) : undefined
                }
              />
              <Text
                type="supporting"
                weight={state === "active" ? "semibold" : "normal"}
                color={
                  state === "upcoming" || state === "stopped"
                    ? "secondary"
                    : "primary"
                }
              >
                {label}
              </Text>
            </HStack>
          ))}
        </HStack>
      )}
      <HStack gap={3} wrap="wrap" vAlign="center" hAlign="between">
        <HStack gap={2} vAlign="start">
          {compact && (
            <StatusDot
              variant={progress.variant}
              label="Publication"
              isPulsing={progress.isRunning}
            />
          )}
          <Text
            type="supporting"
            color="secondary"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {progress.message}
          </Text>
        </HStack>
        <HStack gap={2} wrap="wrap">
          {progress.blocker && (
            <Button
              label="Open earlier publication"
              variant="ghost"
              size="sm"
              href={progress.blocker.href}
            />
          )}
          {hasPullRequest && !compact && (
            <Button
              label="View GitHub review and checks"
              variant="ghost"
              size="sm"
              href={`https://github.com/anipotts/anipotts.com/pull/${prNumber}`}
            />
          )}
          {children}
        </HStack>
      </HStack>
    </VStack>
  );
}
