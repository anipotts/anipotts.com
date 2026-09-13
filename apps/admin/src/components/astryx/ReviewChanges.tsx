import React, { useId, useMemo, useState, type CSSProperties } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Grid } from "@astryxdesign/core/Grid";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Heading } from "@astryxdesign/core/Heading";
import {
  inlinePlainText,
  parseInline,
  type InlineNode,
} from "@anipotts/content/public/inline";
import {
  reviewDiff,
  type ReviewDiffHunk,
  type ReviewDiffLine,
} from "../../lib/review-diff";

type Change = { label: string; before: string; after: string; rich?: boolean };

function formattingNodes(nodes: InlineNode[]): unknown[] {
  return nodes.map((node) =>
    // Keep text positions without their wording, including inside nested marks.
    node.type === "text"
      ? { type: "text" }
      : "children" in node
        ? { ...node, children: formattingNodes(node.children) }
        : node,
  );
}

function DiffLine({
  line,
  side,
  kind,
  row,
  source,
  showFinalEnding,
}: {
  line: ReviewDiffLine;
  side: "before" | "after";
  kind: "equal" | "removed" | "added";
  row: number;
  source: boolean;
  showFinalEnding: boolean;
}) {
  const endingLabel = line.endingChanged
    ? line.ending === "\r\n"
      ? "CRLF line ending"
      : line.ending === "\r"
        ? "CR line ending"
        : line.ending === "\n"
          ? "LF line ending"
          : "No newline at end"
    : showFinalEnding && !line.ending
      ? "No newline at end"
      : null;
  return (
    <HStack
      gap={2}
      paddingInline={3}
      paddingBlock={1}
      vAlign="start"
      role="group"
      aria-label={`${side === "before" ? "Before" : "After"} line ${line.number}${kind === "equal" ? "" : `, ${kind}`}`}
      className="editor-diff-line"
      data-side={side}
      data-kind={kind}
      style={{ "--editor-diff-row": row } as CSSProperties}
    >
      <Text
        type="supporting"
        hasTabularNumbers
        aria-hidden="true"
        className="editor-diff-gutter"
      >
        {line.number}
      </Text>
      <Text type="code" aria-hidden="true" className="editor-diff-sign">
        {kind === "added" ? "+" : kind === "removed" ? "−" : " "}
      </Text>
      <VStack gap={0} className="editor-diff-line-content">
        <Text
          as="p"
          type={source ? "code" : "body"}
          className="editor-diff-text"
        >
          {line.parts.map((part, index) =>
            part.kind === "removed" ? (
              <del key={index}>{part.text}</del>
            ) : part.kind === "added" ? (
              <ins key={index}>{part.text}</ins>
            ) : (
              <React.Fragment key={index}>{part.text}</React.Fragment>
            ),
          )}
        </Text>
        {endingLabel && (
          <Text type="supporting" className="editor-diff-ending">
            {endingLabel}
          </Text>
        )}
      </VStack>
    </HStack>
  );
}

function DiffHunk({
  hunk,
  source,
  showFinalEnding,
}: {
  hunk: ReviewDiffHunk;
  source: boolean;
  showFinalEnding: boolean;
}) {
  return (
    <Grid
      columns={2}
      gap={0}
      className="editor-diff-hunk"
      data-kind={hunk.kind}
    >
      {(["before", "after"] as const).map((side) =>
        hunk[side].map((line, index) => (
          <DiffLine
            key={`${side}-${line.number}`}
            line={line}
            side={side}
            row={index + 1}
            kind={
              hunk.kind === "equal"
                ? "equal"
                : side === "before"
                  ? "removed"
                  : "added"
            }
            source={source}
            showFinalEnding={showFinalEnding}
          />
        )),
      )}
    </Grid>
  );
}

function FieldDiff({
  label,
  before,
  after,
  rich,
  source = false,
}: Change & { source?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const comparison = useMemo(() => {
    const plainBefore = rich ? inlinePlainText(before) : before;
    const plainAfter = rich ? inlinePlainText(after) : after;
    const formatting = (value: string) =>
      JSON.stringify(formattingNodes(parseInline(value)));
    const formattingChanged = Boolean(
      rich &&
      (plainBefore === plainAfter || formatting(before) !== formatting(after)),
    );
    // inlinePlainText normalizes whitespace. Rich source is required when that
    // would erase leading/trailing spaces, line breaks, tabs or repeated spaces.
    const exactWhitespace = Boolean(
      rich &&
      [before, after].some((value) => /(?:^\s|\s$|[^\S ]| {2,})/u.test(value)),
    );
    const showSource = source || formattingChanged || exactWhitespace;
    return {
      hunks: reviewDiff(
        showSource ? before : plainBefore,
        showSource ? after : plainAfter,
      ),
      source: showSource,
      detail: formattingChanged
        ? "Formatting / links / images"
        : exactWhitespace
          ? "Whitespace / source detail"
          : null,
    };
  }, [before, after, rich, source]);
  const hasHiddenContext = comparison.hunks.some(
    (hunk) => hunk.kind === "equal" && hunk.before.length > 8,
  );
  return (
    <VStack
      as="section"
      aria-labelledby={headingId}
      gap={2}
      className="editor-change"
    >
      <HStack
        gap={2}
        wrap="wrap"
        vAlign="center"
        className="editor-diff-heading"
      >
        <Text id={headingId} weight="semibold">
          {label}
        </Text>
        {comparison.detail && (
          <Text type="supporting">{comparison.detail}</Text>
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
      <VStack gap={0} className="editor-diff-content">
        <Grid
          columns={2}
          gap={0}
          className="editor-diff-columns"
          aria-hidden="true"
        >
          <Text type="supporting">Before</Text>
          <Text type="supporting">After</Text>
        </Grid>
        {comparison.hunks.map((hunk, index) => {
          if (expanded || hunk.kind !== "equal" || hunk.before.length <= 8) {
            return (
              <DiffHunk
                key={index}
                hunk={hunk}
                source={comparison.source}
                showFinalEnding={source}
              />
            );
          }
          return (
            <React.Fragment key={index}>
              <DiffHunk
                hunk={{
                  kind: "equal",
                  before: hunk.before.slice(0, 3),
                  after: hunk.after.slice(0, 3),
                }}
                source={comparison.source}
                showFinalEnding={source}
              />
              <Button
                label={`Show ${hunk.before.length - 6} unchanged lines`}
                variant="ghost"
                size="sm"
                className="editor-diff-context"
                onClick={() => setExpanded(true)}
              />
              <DiffHunk
                hunk={{
                  kind: "equal",
                  before: hunk.before.slice(-3),
                  after: hunk.after.slice(-3),
                }}
                source={comparison.source}
                showFinalEnding={source}
              />
            </React.Fragment>
          );
        })}
      </VStack>
    </VStack>
  );
}

export function ReviewHeading({
  id,
  level = 2,
}: {
  id: string;
  level?: 1 | 2;
}) {
  return (
    <HStack
      gap={3}
      wrap="wrap"
      vAlign="center"
      className="editor-review-title-row"
    >
      <Heading level={level} id={id}>
        Review changes
      </Heading>
      <HStack
        gap={2}
        role="group"
        aria-label="Diff legend"
        className="editor-diff-legend"
      >
        <Text type="supporting" className="editor-diff-added">
          + Added
        </Text>
        <Text type="supporting" className="editor-diff-removed">
          − Removed
        </Text>
      </HStack>
    </HStack>
  );
}

export function ReviewChanges({
  destination,
  changes,
  before,
  after,
  labelledBy,
}: {
  labelledBy?: string;
  destination: string;
  changes: Change[];
  before: string;
  after: string;
}) {
  const [sourceView, setSourceView] = useState(false);
  const [layout, setLayout] = useState("split");
  const ownHeadingId = useId();
  const headingId = labelledBy ?? ownHeadingId;
  const changed = changes.filter((change) => change.before !== change.after);
  return (
    <VStack
      as="section"
      aria-labelledby={headingId}
      gap={3}
      className="editor-revision-diff"
      data-layout={layout}
    >
      {!labelledBy && <ReviewHeading id={headingId} />}
      <HStack
        gap={3}
        wrap="wrap"
        vAlign="center"
        hAlign="between"
        className="editor-diff-tools"
      >
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
        <HStack
          gap={2}
          wrap="wrap"
          vAlign="center"
          className="editor-diff-view-controls"
        >
          <HStack className="editor-diff-layout">
            <SegmentedControl
              label="Diff layout"
              value={layout}
              onChange={setLayout}
              size="sm"
            >
              <SegmentedControlItem value="split" label="Side by side" />
              <SegmentedControlItem value="unified" label="Unified" />
            </SegmentedControl>
          </HStack>
          <Button
            label={sourceView ? "Field changes" : "Source diff"}
            aria-pressed={sourceView}
            variant="ghost"
            size="sm"
            onClick={() => setSourceView(!sourceView)}
          />
        </HStack>
      </HStack>
      {sourceView || !changed.length ? (
        before === after ? (
          <Text color="secondary">This draft matches the website.</Text>
        ) : (
          <FieldDiff label="Source" before={before} after={after} source />
        )
      ) : (
        changed.map((change) => <FieldDiff key={change.label} {...change} />)
      )}
    </VStack>
  );
}
