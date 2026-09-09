import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";

/** The shape stays stable while data arrives; only the announcement is spoken. */
export function AdminSkeleton({
  kind = "editor",
  fields = [{}, { rich: true }],
}: {
  kind?: "editor" | "history";
  fields?: ReadonlyArray<{ rich?: boolean }>;
}) {
  return (
    <VStack
      gap={5}
      role="status"
      aria-label={`Loading ${kind}`}
      className="admin-loading"
    >
      <Text className="sr-only">Loading {kind}…</Text>
      <VStack gap={5} aria-hidden="true">
        {kind === "editor" && (
          <HStack gap={3}>
            <Skeleton width="35%" height="var(--spacing-8)" />
            <Skeleton width="20%" height="var(--spacing-8)" />
          </HStack>
        )}
        {(kind === "editor"
          ? fields
          : [{ rich: false }, { rich: false }, { rich: false }]
        ).map((field, index) => (
          <VStack gap={2} key={index}>
            <Skeleton width="25%" height="var(--spacing-4)" index={index} />
            <Skeleton
              height={
                field.rich ? "calc(var(--spacing-10) * 4)" : "var(--spacing-8)"
              }
              index={index + 1}
            />
          </VStack>
        ))}
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
