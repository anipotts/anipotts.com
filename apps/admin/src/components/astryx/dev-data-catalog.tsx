import React from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { DataWorkspace } from "../data/DataWorkspace";

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
const fixture = {
  status: {
    database: { exists: true, writer: false, principal: "owner" },
    counts: {
      records: records.length,
      revisions: records.length,
      sources: 1,
      changes: 0,
    },
    last_change_at: observedAt,
  },
  records,
  sources: [
    {
      source_id: "catalog",
      first_observed_at: observedAt,
      last_observed_at: observedAt,
      record_count: records.length,
      revision_count: records.length,
    },
  ],
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
      <DataWorkspace view="records" enabled fixture={fixture} />
    </VStack>
  );
}
