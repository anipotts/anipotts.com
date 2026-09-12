import React from "react";
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
import type { LifeResult } from "../../data/personal-context";

export const lifeSections = {
  overview: "Life",
  people: "People",
  projects: "Projects",
  places: "Places",
  timeline: "Timeline",
  sources: "Sources",
  preview: "Context Preview",
} as const;
export type LifeSection = keyof typeof lifeSections;
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
}: {
  result: LifeResult;
  section: LifeSection;
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
/** Capped single column. Shared workspace navigation remains owned by Website. */
export function LifeWorkspace({
  section = "overview",
  result,
}: {
  section?: LifeSection;
  result: LifeResult;
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
            <LifeReadView section={section} result={result} />
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
