import React from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import type { SnapshotIssue } from "@anipotts/content/editorial/snapshot";
import { recordCollection } from "../../lib/editorial-collections";
import {
  publicationIssues,
  publicationIssueMessage,
  publicationIssueField,
} from "../../lib/publication-diagnostics";

export function PublicationIssues({
  issues,
  onEdit,
  recordTitle,
}: {
  issues: unknown;
  recordTitle?: (issue: SnapshotIssue) => string | undefined;
  onEdit?: (issue: SnapshotIssue) => boolean;
}) {
  const safe = publicationIssues(issues);
  if (!safe.length) return null;
  return (
    <VStack gap={2} role="region" aria-label="Publication issues">
      <Banner
        status="warning"
        title={`Resolve ${safe.length} ${safe.length === 1 ? "issue" : "issues"} before publishing`}
        description="Your private draft is retained."
      />
      <VStack gap={2} role="list" aria-label="Fields to fix">
        {safe.map((issue, index) => {
          const collection = issue.record && recordCollection(issue.record);
          const href =
            collection && issue.record
              ? `/content/${collection}/${encodeURIComponent(issue.record.id)}`
              : undefined;
          return (
            <HStack
              gap={2}
              key={index}
              vAlign="start"
              hAlign="between"
              role="listitem"
              padding={2}
            >
              <VStack
                gap={1}
                style={{ minWidth: 0, flex: 1, overflowWrap: "anywhere" }}
              >
                <Text type="supporting" weight="semibold">
                  {issue.field
                    ? publicationIssueField(issue.field)
                    : "Content inventory"}
                </Text>
                <Text type="supporting">{publicationIssueMessage(issue)}</Text>
                <Text type="supporting" color="secondary">
                  {recordTitle?.(issue) ??
                    (issue.record
                      ? issue.record.kind === "page" &&
                        issue.record.id === "home"
                        ? "Home"
                        : `${issue.record.kind === "work" ? "Project" : issue.record.kind === "writing" ? "Article" : "Page"} (${issue.record.id})`
                      : "Website content")}
                </Text>
              </VStack>
              {href && (
                <Button
                  size="sm"
                  variant="ghost"
                  label="Fix"
                  aria-label={`Fix ${publicationIssueField(issue.field) || "content inventory"}`}
                  href={href}
                  onClick={(event) => {
                    if (onEdit?.(issue)) event.preventDefault();
                  }}
                />
              )}
            </HStack>
          );
        })}
      </VStack>
    </VStack>
  );
}
