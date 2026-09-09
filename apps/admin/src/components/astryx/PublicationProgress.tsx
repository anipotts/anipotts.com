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

const stageIndex: Record<PublishPhase, number> = {
  validate: 0,
  commit: 0,
  branch: 0,
  pr: 0,
  checks: 1,
  deploy: 2,
  verify: 3,
  live: 3,
  cancelled: -1,
};
const phaseLabels: Record<PublishPhase, string> = {
  validate: "Checking content",
  commit: "Preparing publication",
  branch: "Preparing publication",
  pr: "Opening GitHub review",
  checks: "GitHub checks and approval",
  deploy: "Deploying your changes",
  verify: "Verifying the live website",
  live: "Your changes are live",
  cancelled: "Publication stopped",
};
const stages = ["Prepare", "Checks", "Deploy", "Live"];

export function publicationProgress(job: PublishJob, stale = false) {
  const stopped = job.phase === "cancelled";
  const complete = job.phase === "live" && !job.blocked;
  const active = stageIndex[job.phase];
  const message = stale
    ? "Reconnecting to publication status. Showing the last confirmed step."
    : job.blocked === "publication_base_changed"
      ? "The website changed. Stop this publication, then review your draft again."
      : job.blocked === "record_changed"
        ? "This record changed on the website. Stop publishing, then compare your draft."
        : job.blocked
          ? `Publication paused: ${job.blocked.replaceAll("_", " ")}`
          : phaseLabels[job.phase];
  return {
    message,
    steps: stages.map((label, index) => ({
      label,
      state: (stopped
        ? "stopped"
        : index < active || complete
          ? "complete"
          : index > active
            ? "upcoming"
            : job.blocked
              ? "blocked"
              : stale
                ? "waiting"
                : "active") as
        "stopped" | "complete" | "upcoming" | "blocked" | "waiting" | "active",
    })),
  };
}

export function PublicationProgress({
  publication,
  stale = false,
  children,
}: {
  publication: PublishJob;
  stale?: boolean;
  children?: React.ReactNode;
}) {
  const progress = publicationProgress(publication, stale);
  return (
    <VStack
      gap={3}
      paddingBlock={3}
      className="publication-progress"
      role="region"
      aria-label="Publication progress"
    >
      <HStack
        gap={2}
        className="publication-steps"
        role="list"
        aria-label="Publishing steps"
      >
        {progress.steps.map(({ label, state }) => (
          <VStack
            key={label}
            gap={2}
            className="publication-step"
            data-state={state}
            role="listitem"
            aria-current={state === "active" ? "step" : undefined}
          >
            <HStack gap={2} vAlign="center">
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
                isPulsing={state === "active"}
                icon={
                  state === "complete" ? (
                    <CheckIcon />
                  ) : state === "blocked" || state === "waiting" ? (
                    <WarningIcon />
                  ) : state === "stopped" ? (
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
          </VStack>
        ))}
      </HStack>
      <HStack gap={3} wrap="wrap" vAlign="center" hAlign="between">
        <Text
          type="supporting"
          color="secondary"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {progress.message}
        </Text>
        <HStack gap={2} wrap="wrap">
          {publication.checkpoint.prNumber && (
            <Button
              label="View GitHub checks"
              variant="ghost"
              size="sm"
              href={`https://github.com/anipotts/anipotts.com/pull/${publication.checkpoint.prNumber}/checks`}
            />
          )}
          {children}
        </HStack>
      </HStack>
    </VStack>
  );
}
