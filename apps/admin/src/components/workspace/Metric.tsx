import React from "react";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Figure } from "./Workspace";

export function Metric({
  label,
  value,
  selected = false,
  incomplete = false,
  onSelect,
}: {
  label: string;
  value: number | null;
  selected?: boolean;
  incomplete?: boolean;
  onSelect?: () => void;
}) {
  const count = (
    <Text weight="semibold">
      <Figure value={value} empty="Unknown" />
      {incomplete && value !== null && (
        <>
          <span aria-hidden="true">+</span>
          <span className="sr-only"> or more</span>
        </>
      )}
    </Text>
  );
  return (
    <VStack gap={1} as="li">
      {onSelect ? (
        <Button
          label={label}
          size="sm"
          className="workspace-metric-label"
          variant={selected ? "secondary" : "ghost"}
          aria-pressed={selected}
          onClick={onSelect}
        />
      ) : (
        <Text color="secondary" className="workspace-metric-label">
          {label}
        </Text>
      )}
      {count}
    </VStack>
  );
}
