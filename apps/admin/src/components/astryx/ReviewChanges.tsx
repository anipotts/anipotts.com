import React, { useMemo, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { inlinePlainText } from "@anipotts/content/public/inline";
import { compactDiff, textDiff } from "../../lib/text-diff";

type Change = { label: string; before: string; after: string; rich?: boolean };

function FieldDiff({ label, before, after, rich }: Change) {
  const [expanded, setExpanded] = useState(false);
  const plainBefore = rich ? inlinePlainText(before) : before;
  const plainAfter = rich ? inlinePlainText(after) : after;
  const formattingOnly = rich && plainBefore === plainAfter;
  const parts = useMemo(
    () =>
      textDiff(
        formattingOnly ? before : plainBefore,
        formattingOnly ? after : plainAfter,
      ),
    [before, after, plainBefore, plainAfter, formattingOnly],
  );
  const compact = compactDiff(parts);
  const hasHiddenContext = compact.some(
    (part, index) => part.text !== parts[index]!.text,
  );
  return (
    <VStack gap={2} className="editor-change">
      <HStack
        gap={2}
        wrap="wrap"
        vAlign="center"
        className="editor-diff-heading"
      >
        <Text weight="semibold">{label}</Text>
        {formattingOnly && (
          <Text type="supporting">Formatting / links / images</Text>
        )}
        {hasHiddenContext && (
          <Button
            label={expanded ? "Less context" : "Full context"}
            aria-expanded={expanded}
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          />
        )}
      </HStack>
      <Text as="p" className="editor-inline-diff">
        {(expanded ? parts : compact).map((part, index) =>
          part.kind === "added" ? (
            <ins key={index}>{part.text}</ins>
          ) : part.kind === "removed" ? (
            <del key={index}>{part.text}</del>
          ) : (
            <React.Fragment key={index}>{part.text}</React.Fragment>
          ),
        )}
      </Text>
    </VStack>
  );
}

export function ReviewChanges({
  destination,
  changes,
  before,
  after,
}: {
  destination: string;
  changes: Change[];
  before: string;
  after: string;
}) {
  const [sourceView, setSourceView] = useState(false);
  const changed = changes.filter((change) => change.before !== change.after);
  return (
    <Collapsible
      defaultIsOpen
      trigger={
        <HStack
          gap={3}
          wrap="wrap"
          vAlign="center"
          className="editor-destination"
        >
          <Text weight="semibold">{destination}</Text>
          <Text type="supporting">
            {changed.length
              ? `${changed.length} ${changed.length === 1 ? "field" : "fields"} changed`
              : before === after
                ? "No changes"
                : "Source changed"}
          </Text>
        </HStack>
      }
    >
      <VStack gap={2} className="editor-diff-body">
        <HStack
          gap={3}
          wrap="wrap"
          vAlign="center"
          className="editor-diff-tools"
        >
          <Text type="supporting" className="editor-diff-added">
            + Added
          </Text>
          <Text type="supporting" className="editor-diff-removed">
            − Removed
          </Text>
          <Button
            label={sourceView ? "Field changes" : "Source diff"}
            aria-pressed={sourceView}
            variant="ghost"
            size="sm"
            onClick={() => setSourceView(!sourceView)}
          />
        </HStack>
        {sourceView || !changed.length ? (
          before === after ? (
            <Text color="secondary">This draft matches the website.</Text>
          ) : (
            <FieldDiff label="Source" before={before} after={after} />
          )
        ) : (
          changed.map((change) => <FieldDiff key={change.label} {...change} />)
        )}
      </VStack>
    </Collapsible>
  );
}
