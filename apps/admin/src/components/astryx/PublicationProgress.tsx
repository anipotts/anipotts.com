import React from "react";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { CheckIcon, PauseIcon, WarningIcon } from "@phosphor-icons/react";
import type { DirectPublicationStatus } from "../../lib/editorial-publication-status";

type StepState =
  "stopped" | "complete" | "upcoming" | "blocked" | "waiting" | "active";

/** Never render arbitrary provider errors, URLs or diagnostic payloads. */
function pauseReason(code: string, activated: boolean): string {
  switch (code) {
    case "baseline_changed":
    case "publication_base_changed":
    case "publication_conflict":
      return "the website changed since this review; compare your saved draft with the latest content and review again";
    case "reader_not_ready":
    case "public_reader_not_ready":
      return `the website cannot read this publication yet; restore the compatible website reader, then retry ${activated ? "verification" : "publishing"}`;
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
      return "visibility changes need a separate reviewed action; keep the current visibility and review these edits again, or use Unpublish";
    case "unpublish_breaks_reference":
      return "the homepage still features this piece; remove it from the homepage writing selection, publish the homepage, then unpublish again";
    case "publisher_not_configured":
      return "publishing is unavailable in this environment; restore the publication storage connections before retrying";
    case "publication_unavailable":
    case "storage_unavailable":
      return "publication storage is unavailable; check the recorded status before retrying";
    default:
      return "the publisher needs investigation; preserve the draft and check the recorded status before retrying";
  }
}

export function publicationProgress(
  job: DirectPublicationStatus,
  stale = false,
  now = Date.now(),
) {
  const activated = Boolean(job.publicationId);
  const superseded = job.superseded;
  const stopped = job.phase === "cancelled";
  const verified =
    activated && job.phase === "live" && job.verifiedAt != null && !job.blocked;
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
  // Unpublishing runs the same operation; only what it proves differs.
  const hiding = job.action === "unpublish";
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
        : job.blocked
          ? `${activated ? "Published, but website verification is incomplete" : "Publication needs attention"}: ${pauseReason(job.blocked, activated)}.`
          : uncertain
            ? activated
              ? "Published; website verification still needs confirmation."
              : "Publication status needs reconciliation before confirming a public result."
            : verified
              ? hiding
                ? "Hidden from the website. Its page returns not found, and listings, the feed, search and the sitemap no longer include it."
                : "Your changes were verified on the live website."
              : activated
                ? job.phase === "verify"
                  ? hiding
                    ? "Unpublished. Checking the website before confirming it is gone."
                    : "Published. Checking the website before confirming it is live."
                  : "Published. Website verification is next."
                : unclaimed
                  ? "Publication queued; preparation has not started."
                  : job.phase === "validate"
                    ? hiding
                      ? "Preparing to take this off the website."
                      : "Preparing your reviewed changes for publication."
                    : hiding
                      ? "Taking this off the website."
                      : "Publishing your approved changes.";
  const waiting =
    uncertain || unclaimed || (activated && job.phase !== "verify");
  return {
    message,
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
  publication: DirectPublicationStatus;
  stale?: boolean;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const progress = publicationProgress(publication, stale);
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
          {children}
        </HStack>
      </HStack>
    </VStack>
  );
}
