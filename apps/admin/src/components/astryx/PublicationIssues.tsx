import React from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import type { SnapshotIssue } from "@anipotts/content/editorial/snapshot";
import { recordCollection } from "../../lib/editorial-collections";
import {
  publicationIssues,
  publicationIssueMessage,
} from "../../lib/publication-diagnostics";

export function PublicationIssues({
  issues,
  onEdit,
}: {
  issues: unknown;
  onEdit?: (issue: SnapshotIssue) => boolean;
}) {
  const safe = publicationIssues(issues);
  if (!safe.length) return null;
  return (
    <VStack gap={2} role="region" aria-label="Publication issues">
      {safe.map((issue, index) => {
        const collection = issue.record && recordCollection(issue.record);
        const href =
          collection && issue.record
            ? `/content/${collection}/${encodeURIComponent(issue.record.id)}`
            : undefined;
        return (
          <VStack gap={1} key={index}>
            <HStack gap={2} wrap="wrap" vAlign="center">
              <Text type="supporting" weight="semibold">
                {issue.record
                  ? `${issue.record.kind === "work" ? "project" : issue.record.kind} ${issue.record.id}`
                  : "Content inventory"}
                {issue.field ? ` (${issue.field})` : ""}
              </Text>
              {href && (
                <Button
                  size="sm"
                  variant="ghost"
                  label="Edit record"
                  href={href}
                  onClick={(event) => {
                    if (onEdit?.(issue)) event.preventDefault();
                  }}
                />
              )}
            </HStack>
            <Text type="supporting" color="secondary">
              {publicationIssueMessage(issue)}
            </Text>
          </VStack>
        );
      })}
    </VStack>
  );
}
