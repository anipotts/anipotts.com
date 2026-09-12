import React, { useEffect, useRef, useState } from "react";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { TabList, Tab, TabMenu } from "@astryxdesign/core/TabList";
import { List, ListItem } from "@astryxdesign/core/List";
import { Token } from "@astryxdesign/core/Token";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import type { LifeResult } from "../../data/personal-context";
import {
  LifeReadSession,
  appendLifeBody,
  type LifeReader,
} from "../../lib/life-read-session";

import {
  lifeSections,
  lifeSectionRead,
  type LifeSection,
} from "../../lib/life-sections";
export { lifeSections, type LifeSection };
const href = (section: string) =>
  section === "overview" ? "/life" : `/life/${section}`;
const scalar = (value: unknown, fallback = "Not reported") =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function Metadata({ fields }: { fields: [string, unknown][] }) {
  return (
    <MetadataList label={{ position: "top" }}>
      {fields.map(([label, value]) => (
        <MetadataListItem key={label} label={label}>
          <Text wordBreak="break-word">{scalar(value)}</Text>
        </MetadataListItem>
      ))}
    </MetadataList>
  );
}
function Evidence({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;
  return (
    <Collapsible trigger={<Text>{title}</Text>} defaultIsOpen={false}>
      <Text
        as="p"
        type="code"
        style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
      >
        {JSON.stringify(value, null, 2)}
      </Text>
    </Collapsible>
  );
}
export function LifeRecord({ record }: { record: Record<string, unknown> }) {
  return (
    <VStack gap={4}>
      <Heading level={2}>{scalar(record.title, "Untitled record")}</Heading>
      <Token label={scalar(record.status, "Unconfirmed")} />
      <Text as="p" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {scalar(record.body, "Metadata only")}
      </Text>
      <Metadata
        fields={[
          ["Effective date", scalar(record.occurred_at, "Unknown")],
          ["Date precision", record.date_precision],
          ["Observed", record.observed_at],
          ["Temporal state", record.temporal_status],
          [
            "Confirmed current as of",
            scalar(record.current_as_of, "Not witnessed"),
          ],
          ["Witness state", record.current_as_of_status],
          ["Source", record.source_id],
          ["Source reference", object(record.provenance).source_uri],
          ["Revision", record.revision_id],
          ["Classification", record.tier],
        ]}
      />
      <Evidence title="Assertion and corrections" value={record.assertion} />
      <Evidence title="Preserved revisions" value={record.revisions} />
      <Evidence title="Capture coverage" value={record.metadata} />
      {Array.isArray(record.omitted_fields) && (
        <Text>
          Omitted fields:{" "}
          {record.omitted_fields.map((value) => scalar(value)).join(", ")}
        </Text>
      )}
      {record.next_body_offset != null && (
        <Text>More text is available in this revision.</Text>
      )}
    </VStack>
  );
}
export function LifeReadView({
  result,
  section,
  onSelect,
}: {
  result: LifeResult;
  section: LifeSection;
  onSelect?: (id: string) => void;
}) {
  if (result.state !== "ready")
    return (
      <VStack gap={2} role="status">
        <Text weight="semibold">
          {result.state === "disconnected"
            ? "Life is not connected yet"
            : "Life is unavailable"}
        </Text>
        <Text color="secondary">Your records remain at their source.</Text>
        <Button
          label="Check again"
          href={href(section)}
          variant="ghost"
          size="sm"
        />
      </VStack>
    );
  const data = result.data;
  const items = Array.isArray(data.items) ? data.items.map(object) : [];
  if (section === "preview")
    return (
      <VStack gap={4}>
        <Metadata
          fields={[
            ["Access scope", result.scope],
            ["Tokens", `${scalar(data.token_count)} / ${scalar(data.budget)}`],
            ["Measurement", data.token_measurement],
          ]}
        />
        <Heading level={2}>Exact context</Heading>
        <Text
          as="p"
          type="code"
          style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
        >
          {scalar(data.context_text, "")}
        </Text>
        <Evidence title="Selected sources" value={data.selected} />
        <Evidence title="Omissions" value={data.omitted} />
      </VStack>
    );
  if (section === "overview")
    return (
      <Metadata
        fields={[
          ["Ingestion", object(data.ingestion).state],
          ["Automatic capture", object(data.ingestion).automatic_sources],
          ["Last change", data.last_change_at],
          [
            "Wiki",
            object(data.wiki).available !== true
              ? "Unavailable"
              : object(data.wiki).stale === true
                ? "Stale"
                : "Available",
          ],
        ]}
      />
    );
  return (
    <VStack gap={3}>
      <List
        hasDividers
        density="compact"
        header={<Text>{scalar(data.total)} source records</Text>}
      >
        {items.map((item, index) => (
          <ListItem
            key={scalar(item.record_id ?? item.source_id, String(index))}
            label={scalar(
              section === "sources" ? item.source_id : item.title,
              "Untitled record",
            )}
            onClick={
              section !== "sources" &&
              typeof item.record_id === "string" &&
              onSelect
                ? () => onSelect(item.record_id as string)
                : undefined
            }
            description={
              <Text color="secondary">
                {section === "sources"
                  ? scalar(item.coverage)
                  : `${scalar(item.source_id)} · ${scalar(item.occurred_at, "Date unknown")} · observed ${scalar(item.observed_at)}`}
              </Text>
            }
            endContent={
              <Token label={scalar(item.status, "Unknown")} size="sm" />
            }
          />
        ))}
      </List>
      {items.length === 0 && (
        <Text>No permitted records match this request.</Text>
      )}
      {data.next_offset != null && <Text>More records are available.</Text>}
    </VStack>
  );
}
/** Reader is injected by a separately approved capability, never derived from URL input. */
export function LifeExplorer({
  section,
  initial,
  reader,
}: {
  section: LifeSection;
  initial: LifeResult;
  reader?: LifeReader;
}) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [result, setResult] = useState(initial);
  const [offsets, setOffsets] = useState([0]);
  const [busy, setBusy] = useState(false);
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const listSession = useRef(new LifeReadSession());
  const detailSession = useRef(new LifeReadSession());
  useEffect(
    () => () => {
      listSession.current.invalidate();
      detailSession.current.invalidate();
    },
    [],
  );
  const closeRecord = () => {
    detailSession.current.invalidate();
    setRecord(null);
    setDetailBusy(false);
    setDetailError(null);
  };
  async function load(q: string, history: number[]) {
    if (!reader) return;
    closeRecord();
    setBusy(true);
    const next = await listSession.current.run(
      reader,
      lifeSectionRead(section, { query: q, offset: history.at(-1) ?? 0 }),
    );
    if (next) {
      setResult(next);
      setSubmitted(q);
      setOffsets(history);
      setBusy(false);
    }
  }
  async function select(id: string) {
    if (!reader) return;
    setRecord(null);
    setDetailBusy(true);
    setDetailError(null);
    const next = await detailSession.current.run(reader, { method: "get", id });
    if (next) {
      setDetailBusy(false);
      if (next.state === "ready") setRecord(next.data);
      else
        setDetailError(
          "This record could not be read. Try selecting it again.",
        );
    }
  }
  async function moreBody() {
    if (
      !reader ||
      !record ||
      typeof record.record_id !== "string" ||
      typeof record.next_body_offset !== "number" ||
      detailBusy
    )
      return;
    const current = record;
    setDetailBusy(true);
    setDetailError(null);
    const next = await detailSession.current.run(reader, {
      method: "get",
      id: record.record_id,
      body_offset: record.next_body_offset,
    });
    if (!next) return;
    setDetailBusy(false);
    if (next.state !== "ready") {
      setDetailError("The next section could not be read. Try again.");
      return;
    }
    try {
      setRecord(appendLifeBody(current, next.data));
    } catch (error) {
      setDetailError(
        error instanceof Error
          ? error.message
          : "Reload this record before continuing.",
      );
    }
  }
  const searchable = !["overview", "sources", "timeline"].includes(section);
  const nextOffset =
    result.state === "ready" && typeof result.data.next_offset === "number"
      ? result.data.next_offset
      : null;
  return (
    <VStack gap={4}>
      {searchable && (
        <VStack
          as="form"
          gap={2}
          onSubmit={(event: React.FormEvent) => {
            event.preventDefault();
            void load(query, [0]);
          }}
        >
          <TextInput
            label={section === "preview" ? "Question" : "Search records"}
            value={query}
            onChange={(value) => setQuery(value.slice(0, 2048))}
            isDisabled={!reader}
            disabledMessage="Life is not connected yet"
          />
          <Button
            type="submit"
            label={section === "preview" ? "Preview context" : "Search"}
            isDisabled={!reader}
            isLoading={busy}
          />
        </VStack>
      )}
      {!searchable && reader && (
        <Button
          label="Refresh"
          clickAction={() => load(submitted, offsets)}
          isLoading={busy}
        />
      )}
      {busy ? (
        <Text role="status">Loading records…</Text>
      ) : (
        <LifeReadView
          result={result}
          section={section}
          onSelect={reader ? (id) => void select(id) : undefined}
        />
      )}
      {reader &&
        !busy &&
        result.state === "ready" &&
        (offsets.length > 1 || nextOffset !== null) && (
          <Toolbar
            label="Record pages"
            startContent={
              <Button
                label="Previous"
                isDisabled={offsets.length < 2}
                clickAction={() => load(submitted, offsets.slice(0, -1))}
              />
            }
            endContent={
              <Button
                label="Next"
                isDisabled={nextOffset === null}
                clickAction={() =>
                  nextOffset === null
                    ? Promise.resolve()
                    : load(submitted, [...offsets, nextOffset])
                }
              />
            }
          />
        )}
      {(detailBusy || record || detailError) && (
        <VStack gap={3} as="section" aria-label="Record details">
          <Button label="Close details" onClick={closeRecord} variant="ghost" />
          {detailError && <Text role="alert">{detailError}</Text>}
          {record && <LifeRecord record={record} />}
          {detailBusy && <Text role="status">Reading record…</Text>}
          {record?.next_body_offset != null && (
            <Button
              label="Read more"
              clickAction={moreBody}
              isLoading={detailBusy}
            />
          )}
        </VStack>
      )}
    </VStack>
  );
}
/** Capped single column. Shared workspace navigation remains owned by Website. */
export function LifeWorkspace({
  section = "overview",
  result,
  reader,
}: {
  section?: LifeSection;
  result: LifeResult;
  reader?: LifeReader;
}) {
  const navigate = (value: string) => {
    if (Object.hasOwn(lifeSections, value)) window.location.assign(href(value));
  };
  return (
    <Layout
      height="auto"
      contentWidth={960}
      padding={4}
      header={
        <LayoutHeader>
          <VStack gap={3}>
            <Heading level={1}>{lifeSections[section]}</Heading>
            <TabList value={section} onChange={navigate} hasDivider>
              <Tab value="overview" label="Overview" href="/life" />
              <Tab value="people" label="People" href="/life/people" />
              <TabMenu
                label="More"
                options={Object.entries(lifeSections)
                  .filter(([key]) => key !== "overview" && key !== "people")
                  .map(([value, label]) => ({ value, label }))}
              />
            </TabList>
          </VStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent>
          <VStack gap={6}>
            {section === "preview" && (
              <Metadata
                fields={[
                  ["Strategy", "Lookup only"],
                  ["Token budget", "3,000"],
                  ["Recent window", "Seven days"],
                ]}
              />
            )}
            {section === "people" && (
              <Text color="secondary">
                Source profiles stay separate until their identities are
                reconciled.
              </Text>
            )}
            {section === "timeline" && (
              <Text color="secondary">
                Effective dates and observed dates are kept separately.
              </Text>
            )}
            <LifeExplorer
              key={section}
              section={section}
              initial={result}
              reader={reader}
            />
            {section === "overview" && (
              <List
                hasDividers
                header={<Heading level={2}>Existing views</Heading>}
              >
                <ListItem label="Health" href="/life/health" />
                <ListItem label="Aesthetics" href="/life/aesthetics" />
                <ListItem label="Legacy knowledge" href="/knowledge" />
                <ListItem
                  label="Legacy locations and fleet"
                  href="/knowledge/locations"
                />
              </List>
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
