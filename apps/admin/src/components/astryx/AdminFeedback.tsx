import React from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";

type LoadingKind = "editor" | "history" | "records" | "record" | "preview";
const loadingLabels: Record<LoadingKind, string> = {
  editor: "editor",
  history: "history",
  records: "records",
  record: "record details",
  preview: "preview",
};

/** Shared text geometry for a readable document, not a single oversized block. */
function DocumentLines() {
  return (
    <VStack gap={3}>
      {["100%", "94%", "86%", "100%", "72%"].map((width, index) => (
        <Skeleton
          key={index}
          width={width}
          height="var(--spacing-4)"
          index={index}
        />
      ))}
    </VStack>
  );
}

/** Only the status is spoken. Astryx Skeleton honors prefers-reduced-motion. */
export function AdminSkeleton({
  kind = "editor",
  fields = [{}, { rich: true }],
}: {
  kind?: LoadingKind;
  fields?: ReadonlyArray<{ rich?: boolean; path?: readonly string[] }>;
}) {
  const writing = fields.some((field) => field.path?.[0] === "summary");
  const label = loadingLabels[kind];
  return (
    <VStack
      gap={3}
      role="status"
      aria-label={`Loading ${label}`}
      className="admin-loading"
    >
      <Text className="sr-only">Loading {label}…</Text>
      <VStack gap={3} aria-hidden="true">
        {kind === "editor" && (
          <>
            {/* The editor bar is real while this loads, so the shape starts
                at the title: one large line with no label, then fields. */}
            <VStack gap={4}>
              {fields.map((field, index) => (
                <VStack gap={1} key={field.path?.join(".") ?? index}>
                  {index > 0 && (
                    <Skeleton
                      width="24%"
                      height="var(--spacing-4)"
                      index={index}
                    />
                  )}
                  <Skeleton
                    width={index === 0 ? "72%" : undefined}
                    height={
                      index === 0
                        ? "var(--spacing-10)"
                        : field.rich
                          ? "calc(var(--spacing-10) + var(--spacing-1))"
                          : "var(--spacing-9)"
                    }
                    index={index + 1}
                  />
                </VStack>
              ))}
              {writing && (
                <VStack gap={3} data-loading-region="body">
                  <Skeleton width="20%" height="var(--spacing-4)" />
                  <Skeleton
                    width="64%"
                    height="calc(var(--spacing-10) + var(--spacing-1))"
                  />
                  <DocumentLines />
                  <Skeleton width="20%" height="var(--spacing-4)" />
                </VStack>
              )}
            </VStack>
          </>
        )}
        {(kind === "history" || kind === "records") &&
          [0, 1, 2].map((index) => (
            <HStack key={index} gap={3} wrap="wrap" vAlign="center">
              <VStack gap={2} style={{ flex: "1 1 60%", minWidth: 0 }}>
                <Skeleton width="65%" height="var(--spacing-5)" index={index} />
                <Skeleton width="40%" height="var(--spacing-4)" index={index} />
              </VStack>
              <Skeleton width="20%" height="var(--spacing-6)" index={index} />
            </HStack>
          ))}
        {(kind === "record" || kind === "preview") && (
          <>
            <Skeleton width="65%" height="var(--spacing-10)" />
            <Skeleton width="35%" height="var(--spacing-4)" />
            <Skeleton width="90%" height="var(--spacing-6)" />
            <DocumentLines />
          </>
        )}
      </VStack>
    </VStack>
  );
}

export function RecoveryBanner({
  title,
  description,
  actionLabel,
  onRetry,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  onRetry?: () => void | Promise<void>;
}) {
  return (
    <Banner
      status="error"
      title={title}
      description={description}
      endContent={
        onRetry && (
          <Button
            label={actionLabel ?? "Try again"}
            size="sm"
            clickAction={onRetry}
          />
        )
      }
    />
  );
}
