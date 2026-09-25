import React from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { PrivateShell } from "../data/PrivateShell";

const observedAt = "2026-09-21T09:00:00.000Z";
const records = [
  {
    record_id: "rec-00000000000000000000000000000001",
    revision_id: "catalog-revision-one",
    title: "Synthetic field notes",
    source_id: "catalog",
    kind: "note",
    tier: "open",
    status: "observed",
    observed_at: observedAt,
    body: "This is synthetic record text for checking layout and focus. It is not personal data.",
    body_offset: 0,
    next_body_offset: null,
    provenance: { source_uri: "fixture://catalog/one" },
  },
  {
    record_id: "rec-00000000000000000000000000000002",
    revision_id: "catalog-revision-two",
    title: "研究ノート / café / a longer synthetic record title",
    source_id: "catalog",
    kind: "project",
    tier: "restricted",
    status: "observed",
    observed_at: observedAt,
    body: "A second synthetic record with its own source evidence.",
    body_offset: 0,
    next_body_offset: null,
    provenance: { source_uri: "fixture://catalog/two" },
  },
];
/** The six fields the reader serves per source. The second is withdrawn
 * the way System serves an excluded source: no retrievable records, its
 * content revisions retained, and a last observation a moment before its
 * first. */
const sources = [
  {
    source_id: "catalog",
    status: "partial",
    first_observed_at: observedAt,
    last_observed_at: observedAt,
    record_count: records.length,
    revision_count: records.length,
  },
  {
    source_id: "catalog-withdrawn",
    status: "excluded",
    first_observed_at: "2026-09-20T09:00:00.140Z",
    last_observed_at: "2026-09-20T09:00:00.000Z",
    record_count: 0,
    revision_count: 4,
  },
];
const fixture = {
  status: {
    database: { exists: true, writer: false, principal: "owner" },
    counts: {
      records: records.length,
      revisions: sources.reduce((sum, item) => sum + item.revision_count, 0),
      sources: sources.length,
      changes: 0,
    },
    last_change_at: observedAt,
  },
  records,
  sources,
};

/** The real Data workspace on an in-memory synthetic reader. Never reads a
 * private source. */
export function DevDataCatalog() {
  return (
    <VStack gap={4}>
      <Text color="secondary">
        Synthetic Data workspace. No private reader, storage or network
        connection.
      </Text>
      <PrivateShell
        initialPath="/data/records"
        dataEnabled
        dataFixture={fixture}
        enabled={false}
      />
    </VStack>
  );
}
