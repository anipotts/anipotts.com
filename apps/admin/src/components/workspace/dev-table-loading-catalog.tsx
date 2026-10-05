import React, { useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { DataTable, WorkspaceSection } from "./Workspace";
import { RecentContentTable } from "../overview/AdminOverview";
import { AlertsTable, type AlertRow } from "../observability/AlertsView";
import { recordColumns } from "../data/RecordsView";
import { parseRecord, type DataRecord } from "../data/data-model";
import fixture from "../../fixtures/data_v1.synthetic.json";
import type { CatalogRecord } from "../astryx/EditorialApp";

const now = Date.parse("2026-10-04T22:00:00Z");
const alerts: AlertRow[] = [
  "Synthetic checkout",
  "Synthetic mini",
  "Synthetic pro",
].map((name, index) => ({
  subject: `synthetic-${index}`,
  name,
  kind: "service",
  host: null,
  runbook: null,
  status: "firing",
  state: "failing",
  peak: "failing",
  since: "2026-10-04T20:00:00Z",
  resolvedAt: null,
  detail: null,
  incidents: 1,
}));
const content = [
  "home",
  "sample project",
  "sample guide",
  "sample article",
  "sample notes",
].map((title, index) => ({
  title,
  href: `/content/writing/synthetic-${index}`,
  collection: "writing",
  status: "published",
  updated: { at: "2026-10-04T20:00:00Z" },
})) as CatalogRecord[];
const records = fixture.records
  .slice(0, 5)
  .map((item, index) =>
    parseRecord({
      ...item,
      title: `Synthetic record ${index + 1}`,
      status: "observed",
      occurred_at: "2026-10-04",
      source_id: "synthetic",
    }),
  )
  .filter((item): item is DataRecord => item !== null);
const columns = recordColumns({
  href: (record) => `/data/records/${record.id}`,
  tiersOnly: false,
});

/** Same overview tables, held pending until clicked. No reader or private data. */
export function DevTableLoadingCatalog() {
  const [loading, setLoading] = useState(true);
  return (
    <VStack gap={6}>
      <HStack gap={4}>
        <Text color="secondary">
          Synthetic overview tables. No reader connection.
        </Text>
        <Button
          label={loading ? "Finish loading" : "Reset loading"}
          size="sm"
          variant="secondary"
          onClick={() => setLoading(!loading)}
        />
      </HStack>
      <WorkspaceSection title="Alerts" meta="Derived from state changes">
        <AlertsTable
          rows={loading ? [] : alerts}
          loading={loading}
          loadingRows={3}
          now={now}
        />
      </WorkspaceSection>
      <WorkspaceSection title="Recent content">
        <RecentContentTable
          records={loading ? [] : content}
          loading={loading}
        />
      </WorkspaceSection>
      <WorkspaceSection title="Recent records">
        <DataTable
          rows={loading ? [] : records}
          columns={columns}
          rowKey="id"
          label="Recent records"
          noun={["record", "records"]}
          footer={false}
          loading={loading}
          loadingRows={5}
        />
      </WorkspaceSection>
    </VStack>
  );
}
