import React, { useId, useMemo, useState, type CSSProperties } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Grid } from "@astryxdesign/core/Grid";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "./WritingControls";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Heading } from "@astryxdesign/core/Heading";
import { ToggleButton } from "./WritingControls";
import { CodeIcon } from "@phosphor-icons/react";
import { inlineHtml, safeInlineUrl } from "@anipotts/content/public/inline";
import {
  reviewDiff,
  type ReviewDiffHunk,
  type ReviewDiffLine,
} from "../../lib/review-diff";

import { SaveStatus, type SaveStatusProps } from "./SaveStatus";

type Change = {
  label: string;
  before: string;
  after: string;
  rich?: boolean;
  presentation?: boolean;
  onEdit?: () => void;
};

function PresentationValue({ value }: { value: string }) {
  const content = JSON.parse(value) as {
    sections: Record<string, Record<string, unknown>>;
    order: string[];
  };
  return (
    <div className="editor-review-sections">
      {content.order.map((id) => {
        const section = content.sections[id];
        if (!section) return null;
        return (
          <section key={id} className="editor-review-section">
            <h3>{String(section.label || id.replaceAll("_", " "))}</h3>
            {section.visible === false && <p>Hidden</p>}
            {Object.entries(section)
              .filter(
                ([key]) =>
                  key !== "label" &&
                  key !== "visible" &&
                  !key.endsWith("_format") &&
                  key !== "mention_keys",
              )
              .map(([key, entry]) => (
                <div key={key}>
                  <small>
                    {key === "writing_slugs"
                      ? "Articles"
                      : key === "limit"
                        ? "Display limit"
                        : key.replaceAll("_", " ")}
                  </small>
                  {Array.isArray(entry) ? (
                    <ol>
                      {entry.map((item, index) => (
                        <li key={index}>
                          {typeof item === "string" ? (
                            item.replaceAll("-", " ")
                          ) : item &&
                            typeof item === "object" &&
                            "href" in item &&
                            typeof item.href === "string" &&
                            safeInlineUrl(item.href) ? (
                            <a href={item.href}>
                              {String(item.label ?? item.href)}
                            </a>
                          ) : (
                            String(item?.label ?? item?.title ?? "Item")
                          )}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p
                      dangerouslySetInnerHTML={{
                        __html: inlineHtml(String(entry ?? "")),
                      }}
                    />
                  )}
                </div>
              ))}
          </section>
        );
      })}
    </div>
  );
}

function RenderedChange({
  label,
  before,
  after,
  presentation,
  onEdit,
}: Change) {
  const singleSide = before ? (after ? undefined : "before") : "after";
  return (
    <section
      className="editor-change"
      aria-label={label}
      data-single-side={singleSide}
    >
      <HStack gap={2}>
        <Text weight="semibold">{label}</Text>
        {onEdit && (
          <Button
            label="Edit"
            aria-label={`Edit ${label}`}
            variant="ghost"
            size="sm"
            onClick={onEdit}
          />
        )}
      </HStack>
      <div className="editor-rendered-comparison">
        {([before, after] as const).map((value, index) =>
          singleSide && !value ? null : (
            <div key={index} data-side={index ? "after" : "before"}>
              <Text type="supporting">
                {singleSide
                  ? index
                    ? "Added"
                    : "Removed"
                  : index
                    ? "After"
                    : "Before"}
              </Text>
              <div className="editor-rendered-value">
                {presentation ? (
                  <PresentationValue value={value} />
                ) : (
                  <p dangerouslySetInnerHTML={{ __html: inlineHtml(value) }} />
                )}
              </div>
            </div>
          ),
        )}
      </div>
    </section>
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
      columnGap={3}
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
  source = false,
  onEdit,
}: Change & { source?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const comparison = useMemo(
    () => ({ hunks: reviewDiff(before, after), source }),
    [before, after, source],
  );
  const singleSide = before ? (after ? undefined : "before") : "after";
  const hasHiddenContext = comparison.hunks.some(
    (hunk) => hunk.kind === "equal" && hunk.before.length > 8,
  );
  return (
    <VStack
      as="section"
      aria-labelledby={headingId}
      gap={2}
      className="editor-change"
      data-single-side={singleSide}
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
        {onEdit && (
          <Button
            label="Edit"
            aria-label={`Edit ${label}`}
            variant="ghost"
            size="sm"
            onClick={onEdit}
          />
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
          columnGap={3}
          className="editor-diff-columns"
          aria-hidden="true"
        >
          {!singleSide && <Text type="supporting">Before</Text>}
          {!singleSide && <Text type="supporting">After</Text>}
          {singleSide && (
            <Text type="supporting">
              {singleSide === "after" ? "Added" : "Removed"}
            </Text>
          )}
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
  saveStatus,
}: {
  id: string;
  level?: 1 | 2;
  saveStatus?: SaveStatusProps;
}) {
  return (
    <HStack
      gap={3}
      wrap="wrap"
      vAlign="center"
      hAlign="between"
      className="editor-review-title-row"
    >
      <HStack gap={3} wrap="wrap" vAlign="center" maxWidth="100%">
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
      {saveStatus && (
        <HStack maxWidth="100%" style={{ marginInlineStart: "auto" }}>
          <SaveStatus {...saveStatus} showLabel />
        </HStack>
      )}
    </HStack>
  );
}

/** The diff's colour key, only where there is a diff to read. */
function DiffLegend() {
  return (
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
  );
}

export function ReviewChanges({
  destination,
  changes,
  before,
  after,
  labelledBy,
  label,
}: {
  labelledBy?: string;
  /** The section's name when a sheet or panel already titles it. The
   * section then draws no heading of its own. */
  label?: string;
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
  const differs = before !== after;
  const hasComparableSides = sourceView
    ? Boolean(before && after)
    : changed.some((change) => Boolean(change.before && change.after));
  return (
    <VStack
      as="section"
      aria-labelledby={label ? undefined : headingId}
      aria-label={label}
      gap={3}
      className="editor-revision-diff"
      data-layout={layout}
    >
      {!labelledBy && !label && <ReviewHeading id={headingId} />}
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
        {differs && (
          <HStack
            gap={2}
            wrap="wrap"
            vAlign="center"
            className="editor-diff-view-controls"
          >
            {label && <DiffLegend />}
            {hasComparableSides && (
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
            )}
            <ToggleButton
              label="Source diff"
              tooltip="Source diff"
              isIconOnly
              size="sm"
              icon={<CodeIcon weight="regular" aria-hidden="true" />}
              isPressed={sourceView}
              onPressedChange={setSourceView}
            />
          </HStack>
        )}
      </HStack>
      {differs && !changed.length && !sourceView && (
        <Text type="supporting">
          Source diff includes changes without a rendered comparison.
        </Text>
      )}
      {sourceView ? (
        before === after ? null : (
          <FieldDiff label="Source" before={before} after={after} source />
        )
      ) : (
        changed.map((change) =>
          change.rich || change.presentation ? (
            <RenderedChange key={change.label} {...change} />
          ) : (
            <FieldDiff key={change.label} {...change} />
          ),
        )
      )}
    </VStack>
  );
}
