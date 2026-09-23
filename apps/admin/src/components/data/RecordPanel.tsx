import React, { useMemo } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowBendUpLeftIcon,
  CalendarBlankIcon,
  XIcon,
} from "@phosphor-icons/react";
import { brandMark } from "@anipotts/brand/marks";
import type { DataResult } from "../../data/personal-context";
import {
  historyEntries,
  readableBlocks,
  recordDetails,
  summaryBlocks,
  type Detail,
  type SummaryBlock,
  type Technical,
} from "../../lib/data-record";
import { deviceName, hostDevice } from "../../lib/naming";
import { useNamedSource } from "./source-catalog";
import { BrandTile } from "../BrandTile";
import { SplitPanel, useSplitView } from "../astryx/SplitView";
import { clockText, durationText } from "../workspace/format";
import {
  CompactTimeline,
  DefinitionList,
  EasternClock,
  InlineNotice,
  LoadingSkeleton,
  RelativeTime,
  StateBadge,
  TechnicalSection,
  badgeFor,
  TierMark,
  ValueChips,
} from "../workspace/Workspace";
import {
  effectiveDate,
  recordMark,
  type DataRecord,
  type RecordMark,
} from "./data-model";
import { ReadNotice } from "./DataNotices";

type Failure = Exclude<DataResult, { state: "ready" }>;

const ABSOLUTE = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** A time as a detail: the clock time on the timeline's pattern, with the
 * relative time muted beside it. */
function Observed({ value }: { value: string | null }) {
  const ms = Date.parse(value ?? "");
  if (!Number.isFinite(ms)) return <Text color="secondary">Not recorded</Text>;
  return (
    <span className="data-record-when">
      <Clock ms={ms} />
      <Text color="secondary">
        <RelativeTime value={value} />
      </Text>
    </span>
  );
}

/** A clock time on the timeline's pattern, with the absolute time on hover.
 * A record draws in the browser only, so the viewer's zone is safe here. */
function Clock({ ms }: { ms: number }) {
  return (
    <time
      dateTime={new Date(ms).toISOString()}
      title={ABSOLUTE.format(ms)}
      className="workspace-time"
    >
      {clockText(ms)}
    </time>
  );
}

/** A tile and its name, inline. */
function Tile({
  id,
  kind,
  text,
  title,
}: {
  id: string | null;
  kind?: Parameters<typeof BrandTile>[0]["kind"];
  text: string;
  title?: string;
}) {
  return (
    <span className="data-inline" title={title}>
      <BrandTile id={id} kind={kind} size={20} />
      <span className="data-inline-text">{text}</span>
    </span>
  );
}

/** Values as chips, written as they are. */
function Chips({ items, label }: { items: string[]; label: string }) {
  return (
    <ul className="workspace-chips" aria-label={label}>
      {items.map((item, index) => (
        <li key={`${index}:${item}`} className="workspace-chip" title={item}>
          <span className="workspace-chip-value">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DetailNode({ detail }: { detail: Detail }) {
  const { value } = detail;
  switch (value.type) {
    case "text":
      return <>{value.text}</>;
    case "figure":
      return <span className="workspace-figure">{value.text}</span>;
    case "time":
      return <Clock ms={value.ms} />;
    case "duration":
      return <span className="workspace-figure">{durationText(value.ms)}</span>;
    case "chips":
      return (
        <ValueChips
          value={value.value}
          field={value.field}
          raw={value.raw}
          label={detail.label}
        />
      );
    case "list":
      return <Chips items={value.items} label={detail.label} />;
    case "device": {
      const tile = hostDevice(value.host);
      return tile ? (
        <Tile id={tile.id} kind="device" text={deviceName(value.host)} />
      ) : (
        <>{value.host}</>
      );
    }
    case "app":
      return (
        <Tile id={value.id} text={brandMark(value.id)?.label ?? value.text} />
      );
  }
}

function technicalItem(entry: Technical) {
  const { value } = entry;
  if (value.type === "copy")
    return { label: entry.label, value: value.value, display: value.display };
  if (value.type === "text")
    return {
      label: entry.label,
      node: <span className="data-record-plain">{value.text}</span>,
    };
  return {
    label: entry.label,
    node: <ValueChips value={value.value} field={value.field} />,
  };
}

/** The body as people read it: paragraphs keep their line breaks, lists are
 * lists with their counts set apart, and label pairs line up. */
function Summary({ blocks }: { blocks: SummaryBlock[] }) {
  if (!blocks.length) return null;
  return (
    <div className="data-record-summary">
      {blocks.map((block, index) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={index} className="data-record-text">
                {block.lines.map((line, at) => (
                  <React.Fragment key={at}>
                    {at > 0 && <br />}
                    {line}
                  </React.Fragment>
                ))}
              </p>
            );
          case "heading":
            return (
              <p key={index} className="data-record-subhead">
                {block.text}
              </p>
            );
          case "fields":
            return (
              <DefinitionList
                key={index}
                items={block.items.map((item) => [item.label, item.value])}
              />
            );
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <div key={index} className="data-record-list-block">
                {block.title && (
                  <p className="data-record-subhead">{block.title}</p>
                )}
                <List
                  className="data-record-list"
                  data-figures={
                    block.items.some((item) => item.figure) ? "" : undefined
                  }
                >
                  {block.items.map((item, at) => (
                    <li key={at}>
                      <span className="data-record-item">{item.text}</span>
                      {item.figure && (
                        <span className="workspace-figure">{item.figure}</span>
                      )}
                    </li>
                  ))}
                </List>
              </div>
            );
          }
        }
      })}
    </div>
  );
}

/** One row of facts: where it came from, the device, its date and tier, and
 * a state other than the default. */
function Facts({ record, mark }: { record: DataRecord; mark: RecordMark }) {
  const source = useNamedSource(record.source, record.host);
  const tile = mark.tile ?? source?.tile ?? null;
  const occurred = effectiveDate(record.occurredAt, record.datePrecision);
  const date =
    occurred ??
    (Number.isFinite(Date.parse(record.observedAt ?? ""))
      ? effectiveDate(record.observedAt, "day")
      : null);
  return (
    <ul className="data-facts" aria-label="Record facts">
      {source && (
        <li title={source.tooltip}>
          {tile ? (
            <BrandTile id={tile.id} kind={tile.kind} size={20} />
          ) : (
            <mark.glyph weight="regular" aria-hidden="true" />
          )}
          <span className="data-inline-text">{source.name}</span>
        </li>
      )}
      {mark.device && record.host && (
        <li title={record.host}>
          <BrandTile id={mark.device.id} kind="device" size={20} />
          <span className="data-inline-text">{deviceName(record.host)}</span>
        </li>
      )}
      {date && (
        <li title={occurred ? "Date" : "Observed"}>
          <CalendarBlankIcon weight="regular" aria-hidden="true" />
          <span className="data-inline-text">{date}</span>
        </li>
      )}
      {record.tier && (
        <li>
          <TierMark tier={record.tier} />
        </li>
      )}
      {!badgeFor("record", record.status).isDefault && (
        <li>
          <StateBadge domain="record" state={record.status} />
        </li>
      )}
    </ul>
  );
}

function History({ record }: { record: DataRecord }) {
  const split = useSplitView();
  const { revisions, historyLimit } = record;
  if (!revisions.length) return null;
  const capped = historyLimit !== null && revisions.length >= historyLimit;
  return (
    <VStack gap={2} as="section" aria-label="History">
      <Heading level={split ? 3 : 2} className="data-record-section">
        History
        <span
          className="workspace-count data-record-count"
          title={
            capped
              ? `Latest ${historyLimit} revisions; older ones are kept`
              : undefined
          }
        >
          {capped ? `${historyLimit}+` : revisions.length}
        </span>
      </Heading>
      <CompactTimeline
        label="Revision history"
        hashLabel="Source version"
        items={historyEntries(revisions, record.revisionId, capped)}
      />
    </VStack>
  );
}

function Body({
  record,
  mark,
  busy,
  moreFailed,
  onMore,
}: {
  record: DataRecord;
  mark: RecordMark;
  busy: boolean;
  moreFailed: boolean;
  onMore: () => void;
}) {
  const blocks = useMemo(
    () => readableBlocks(summaryBlocks(record.body)),
    [record.body],
  );
  const { details, technical } = useMemo(
    () => recordDetails(record.raw),
    [record.raw],
  );
  return (
    <VStack gap={5}>
      <Summary blocks={blocks} />
      {record.nextBodyOffset !== null && (
        <HStack>
          <Button
            label="Read more"
            size="sm"
            variant="secondary"
            onClick={onMore}
            isLoading={busy}
          />
        </HStack>
      )}
      {moreFailed && (
        <InlineNotice tone="warning" title="Next part unreadable" />
      )}
      <Facts record={record} mark={mark} />
      <DefinitionList
        label="Details"
        items={[
          [
            "Kind",
            <span key="kind" className="data-inline">
              <mark.glyph weight="regular" aria-hidden="true" />
              <span className="data-inline-text">{mark.kindName}</span>
            </span>,
          ],
          ["Observed", <Observed key="observed" value={record.observedAt} />],
          ...details.map(
            (detail) =>
              [
                detail.label,
                <DetailNode key={detail.key} detail={detail} />,
              ] as const,
          ),
        ]}
      />
      <TechnicalSection items={technical.map(technicalItem)} />
      <History record={record} />
    </VStack>
  );
}

/**
 * One record, readable first: the body as prose and lists, one row of facts
 * (source, device, date, tier), the details under human labels, the
 * technical fields collapsed, then the history. On its own it is the page:
 * an icon back and the title as the H1. Beside the list it is a SplitPanel
 * whose header (the title and a close icon) stays pinned while its body
 * scrolls on its own.
 */
export function RecordPanel({
  record,
  busy,
  failure,
  moreFailed = false,
  onMore,
  onRetry,
  onClose,
  panelRef,
  id,
}: {
  record: DataRecord | null;
  busy: boolean;
  failure: Failure | null;
  /** The next part of the body could not be read. */
  moreFailed?: boolean;
  onMore: () => void;
  onRetry?: () => void;
  onClose?: () => void;
  panelRef?: React.Ref<HTMLElement>;
  id?: string;
}) {
  const split = useSplitView();
  const mark = useMemo(() => (record ? recordMark(record) : null), [record]);
  const title = mark?.name ?? "Record";
  const action = split ? "Close record" : "Back to records";
  const close = onClose && (
    <Button
      label={action}
      tooltip={action}
      isIconOnly
      size="sm"
      variant="ghost"
      icon={
        split ? (
          <XIcon weight="regular" aria-hidden="true" />
        ) : (
          <ArrowBendUpLeftIcon weight="regular" aria-hidden="true" />
        )
      }
      onClick={onClose}
      className="data-record-action"
    />
  );
  return (
    <SplitPanel
      id={id}
      ref={panelRef}
      tabIndex={-1}
      aria-label={`${title} details`}
      className="data-record"
      data-split={split ? "true" : "false"}
      header={
        <div className="data-record-bar">
          {/* On its own the record is the page, so its first line carries
              the way back and the live Eastern clock, as every workspace
              page's title line does. */}
          {!split && (
            <div className="data-record-line">
              {close}
              <EasternClock />
            </div>
          )}
          {mark && (
            <div className="data-record-heading" title={record?.title ?? title}>
              <Heading level={split ? 2 : 1} className="data-record-title">
                {title}
              </Heading>
            </div>
          )}
          {split && close}
        </div>
      }
    >
      {!record || !mark ? (
        failure ? (
          <ReadNotice result={failure} onRetry={onRetry} />
        ) : (
          busy && <LoadingSkeleton label="record" rows={3} columns={2} />
        )
      ) : (
        <Body
          record={record}
          mark={mark}
          busy={busy}
          moreFailed={moreFailed}
          onMore={onMore}
        />
      )}
    </SplitPanel>
  );
}
