import React, { useMemo, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { Text } from "@astryxdesign/core/Text";
import { Selector } from "@astryxdesign/core/Selector";
import { LifeWorkspace } from "../life/LifeWorkspace";
import type { LifeResult } from "../../data/personal-context";
import type { LifeReader } from "../../lib/life-read-session";

const observedAt = "2026-09-21T09:00:00.000Z";
const records = [
  {
    record_id: "catalog-one",
    revision_id: "catalog-revision-one",
    title: "Synthetic field notes",
    source_id: "catalog",
    status: "observed",
    observed_at: observedAt,
    body: "This is synthetic record text for checking layout and focus. It is not personal data.",
    body_offset: 0,
    next_body_offset: null,
    provenance: { source_uri: "fixture://catalog/one" },
  },
  {
    record_id: "catalog-two",
    revision_id: "catalog-revision-two",
    title: "研究ノート · café · a longer synthetic record title",
    source_id: "catalog",
    status: "observed",
    observed_at: observedAt,
    body: "A second synthetic record with its own source evidence.",
    body_offset: 0,
    next_body_offset: null,
    provenance: { source_uri: "fixture://catalog/two" },
  },
];
const ready = (data: Record<string, unknown>): LifeResult => ({
  state: "ready",
  scope: "owner",
  observedAt,
  data,
});
const initial = ready({
  items: records,
  total: records.length,
  next_offset: null,
});

/** Real workspace components with an in-memory reader. Never reads a private source. */
export function DevDataCatalog() {
  const [mode, setMode] = useState("ready");
  const reader = useMemo<LifeReader>(
    () => async (request) => {
      if (request.method === "get") {
        if (mode === "unavailable")
          return {
            state: "unavailable",
            message: "Synthetic source unavailable.",
          };
        if (mode === "denied")
          return { state: "denied", message: "Synthetic access expired." };
        const record = records.find((item) => item.record_id === request.id);
        return record
          ? ready(record)
          : { state: "not_found", message: "Synthetic record not found." };
      }
      return initial;
    },
    [mode],
  );
  return (
    <VStack gap={4}>
      <Text color="secondary">
        Synthetic Data workspace. No private reader, storage or network
        connection.
      </Text>
      <Selector
        label="Record response"
        size="sm"
        value={mode}
        onChange={setMode}
        options={[
          { value: "ready", label: "Available record" },
          { value: "unavailable", label: "Source unavailable" },
          { value: "denied", label: "Access expired" },
        ]}
      />
      <LifeWorkspace section="people" result={initial} reader={reader} />
    </VStack>
  );
}
