import React, { useEffect, useState, useRef } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  SERVICE_INVENTORY,
  deriveServiceState,
  parseObservabilitySnapshot,
} from "../../lib/observability-model";
import type { ObservabilityReadResult } from "../../lib/observability-reader";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Table, proportional } from "@astryxdesign/core/Table";
import { TabList, Tab, TabMenu } from "@astryxdesign/core/TabList";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Collapsible, CollapsibleGroup } from "@astryxdesign/core/Collapsible";
import { StatusDot } from "@astryxdesign/core/StatusDot";

const words = (value: string) => value.replaceAll("-", " ");
const label = (id: string) =>
  SERVICE_INVENTORY.find((item) => item.id === id)?.label ?? id;

export function ObservabilityWorkspace({
  initial,
  initialView = "machines",
}: {
  initial: ObservabilityReadResult;
  initialView?: string;
}) {
  const [result, setResult] = useState(initial);
  const [query, setQuery] = useState("");
  const allowedViews = [
    "machines",
    "loops",
    "activity",
    "coverage",
    "traces",
    "metrics",
    "incidents",
  ];
  const [view, setView] = useState(
    allowedViews.includes(initialView) ? initialView : "machines",
  );
  const changeView = (next: string) => {
    if (!allowedViews.includes(next)) return;
    setView(next);
    const url = new URL(location.href);
    url.searchParams.set("view", next);
    history.replaceState(history.state, "", url);
    window.dispatchEvent(new Event("admin:workspace-navigation"));
  };
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    // An unconfigured source never becomes an accidental background consumer.
    if (initial.status === "unconfigured" && retry === 0) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function refresh() {
      refreshingRef.current = true;
      setRefreshing(true);
      try {
        const response = await fetch("/api/admin/observability", {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]),
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
        });
        if (!response.ok) throw new Error("unavailable");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("unavailable");
        let text = "";
        let bytes = 0;
        const decoder = new TextDecoder();
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 262144) throw new Error("limit");
            text += decoder.decode(part.value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          void reader.cancel().catch(() => undefined);
        }
        const body = JSON.parse(text);
        if (!["connected", "unconfigured"].includes(body.status))
          throw new Error("unavailable");
        const snapshot = parseObservabilitySnapshot(body.snapshot);
        if ((body.status === "connected") !== (snapshot.source === "live"))
          throw new Error("unavailable");
        if (abort.signal.aborted) return;
        setResult({ status: body.status, snapshot });
        failures = 0;
        if (body.status === "unconfigured") return;
      } catch {
        if (abort.signal.aborted) return;
        failures++;
        // Legacy reader status describes read availability, not machine evidence.
        setResult((previous) => ({ ...previous, status: "disconnected" }));
      } finally {
        if (!abort.signal.aborted) {
          refreshingRef.current = false;
          setRefreshing(false);
        }
      }
      if (!abort.signal.aborted)
        timer = setTimeout(refresh, Math.min(30000, 1000 * 2 ** failures));
    }
    void refresh();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [initial.status, retry]);
  const { snapshot, status } = result;
  const matches = (...values: string[]) =>
    values.join(" ").toLowerCase().includes(query.trim().toLowerCase());
  const isInventory = ["machines", "loops", "coverage"].includes(view);
  const inventory = snapshot.services.filter((service) =>
    view === "machines"
      ? service.id.startsWith("mac-")
      : view === "loops"
        ? [
            "personalcontext-capture",
            "personalcontext-ingestion",
            "personalcontext-wiki",
            "personalcontext-backups",
            "personalcontext-collector",
            "delegate-collector",
          ].includes(service.id)
        : true,
  );
  const services = inventory.filter((service) =>
    matches(label(service.id), service.id, deriveServiceState(service, now)),
  );
  const events = snapshot.events
    .filter((event) =>
      matches(label(event.serviceId), event.kind, event.evidenceId),
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const spans = snapshot.spans.filter((span) =>
    matches(label(span.serviceId), span.traceId, span.operation),
  );
  const metrics = snapshot.metrics.filter((metric) =>
    matches(label(metric.serviceId), metric.name),
  );
  const incidents = snapshot.incidents.filter((incident) =>
    matches(label(incident.serviceId), incident.state, incident.evidenceId),
  );
  const stateLabel = (id: string) => {
    const service = snapshot.services.find((item) => item.id === id)!;
    return status === "disconnected"
      ? `Last known: ${title(deriveServiceState(service, now))}`
      : title(deriveServiceState(service, now));
  };
  const coverageRows = services.map((service) => ({
    id: service.id,
    service: label(service.id),
    state: stateLabel(service.id),
    details: (
      <MetadataList label={{ position: "top" }} orientation="horizontal">
        <MetadataListItem label="Instrumentation">
          {service.instrumentation === "unknown"
            ? "Not verified"
            : title(service.instrumentation)}
        </MetadataListItem>
        <MetadataListItem label="Last observation">
          {service.lastObservedAt ? (
            <Timestamp value={service.lastObservedAt} format="auto" isLive />
          ) : (
            "Not observed"
          )}
        </MetadataListItem>
        <MetadataListItem label="Last outcome">
          {title(service.outcome)}
        </MetadataListItem>
      </MetadataList>
    ),
  }));
  const evidenceRows =
    view === "activity"
      ? events.map((event) => ({
          id: `${event.serviceId}:${event.evidenceId}:${event.kind}`,
          service: label(event.serviceId),
          state: title(event.kind),
          details: <Evidence at={event.at} id={event.evidenceId} />,
        }))
      : view === "traces"
        ? spans.map((span) => ({
            id: `${span.traceId}:${span.spanId}`,
            service: label(span.serviceId),
            state: title(span.outcome),
            details: (
              <VStack gap={1}>
                <Text>
                  {title(span.operation)} · {span.durationMs} ms
                </Text>
                <Evidence at={span.startedAt} id={span.traceId} />
                <Text type="code">{span.spanId}</Text>
              </VStack>
            ),
          }))
        : view === "metrics"
          ? metrics.map((metric) => ({
              id: `${metric.serviceId}:${metric.name}:${metric.at}`,
              service: label(metric.serviceId),
              state: title(metric.name),
              details: (
                <VStack gap={1}>
                  <Text>{metric.value}</Text>
                  <Timestamp value={metric.at} format="auto" isLive />
                </VStack>
              ),
            }))
          : incidents.map((incident) => ({
              id: `${incident.evidenceId}:${incident.state}`,
              service: label(incident.serviceId),
              state: title(incident.state),
              details: (
                <VStack gap={1}>
                  <Text>Next action: {title(incident.nextAction)}</Text>
                  <Evidence at={incident.at} id={incident.evidenceId} />
                </VStack>
              ),
            }));
  const rows = isInventory ? coverageRows : evidenceRows;
  const total = isInventory
    ? inventory.length
    : view === "activity"
      ? snapshot.events.length
      : view === "traces"
        ? snapshot.spans.length
        : view === "metrics"
          ? snapshot.metrics.length
          : snapshot.incidents.length;
  const unavailable = !isInventory && total === 0 && status !== "connected";
  return (
    <Layout
      className="admin-observability-layout"
      height="auto"
      padding={4}
      content={
        <LayoutContent label="Operations">
          <VStack gap={5}>
            <VStack gap={1}>
              <Heading level={1}>Operations</Heading>
            </VStack>
            <Banner
              status={status === "connected" ? "info" : "warning"}
              title={
                status === "connected"
                  ? "Telemetry connected"
                  : status === "unconfigured"
                    ? "Live telemetry is not connected"
                    : "Telemetry unavailable; showing last-known observations"
              }
            />
            <HStack gap={3} wrap="wrap" vAlign="center">
              <Button
                label="Reconnect"
                isLoading={refreshing}
                isDisabled={refreshing}
                onClick={() => {
                  if (refreshingRef.current) return;
                  refreshingRef.current = true;
                  setRefreshing(true);
                  setRetry((value) => value + 1);
                }}
              />
              <Text role="status" color="secondary">
                {status === "connected"
                  ? "Last received"
                  : status === "unconfigured"
                    ? "No live observations received"
                    : "Latest read unavailable"}
              </Text>
              {snapshot.source === "live" && (
                <Timestamp value={snapshot.observedAt} format="auto" isLive />
              )}
            </HStack>
            <TabList
              value={view}
              onChange={changeView}
              hasDivider
              aria-label="Operations views"
              style={{ flexWrap: "wrap" }}
            >
              {["machines", "loops", "activity"].map((tab) => (
                <Tab
                  key={tab}
                  value={tab}
                  label={title(tab)}
                  id={`observability-tab-${tab}`}
                  aria-controls="observability-panel"
                />
              ))}
              <TabMenu
                label="More"
                options={["coverage", "traces", "metrics", "incidents"].map(
                  (value) => ({ value, label: title(value) }),
                )}
              />
            </TabList>
            <TextInput
              label="Search evidence"
              value={query}
              onChange={setQuery}
              placeholder="Service, state, trace or evidence ID"
            />
            <VStack
              gap={3}
              role="region"
              id="observability-panel"
              aria-label={title(view)}
              tabIndex={0}
            >
              <Heading level={2}>
                {view === "machines"
                  ? "Machines"
                  : view === "loops"
                    ? "Loops"
                    : view === "coverage"
                      ? "Coverage"
                      : view === "activity"
                        ? "Latest activity"
                        : view === "traces"
                          ? "Measured execution"
                          : view === "metrics"
                            ? "Capacity and retention"
                            : "PersonalContext incidents"}
              </Heading>
              {rows.length && isInventory ? (
                <CollapsibleGroup type="multiple" hasDividers>
                  {services.map((service) => (
                    <Collapsible
                      key={service.id}
                      value={service.id}
                      defaultIsOpen={false}
                      trigger={
                        <VStack gap={2} width="100%">
                          <Text
                            weight="semibold"
                            style={{ overflowWrap: "anywhere" }}
                          >
                            {label(service.id)}
                          </Text>
                          <HStack gap={4} wrap="wrap" vAlign="center">
                            <HStack gap={2} vAlign="center">
                              <StatusDot
                                label={stateLabel(service.id)}
                                variant={
                                  stateLabel(service.id) === "Healthy"
                                    ? "success"
                                    : stateLabel(service.id) === "Failed"
                                      ? "error"
                                      : "neutral"
                                }
                              />
                              <Text>{stateLabel(service.id)}</Text>
                            </HStack>
                            <Text color="secondary">Last contact: Unknown</Text>
                          </HStack>
                        </VStack>
                      }
                    >
                      <MetadataList label={{ position: "top" }}>
                        <MetadataListItem label="Instrumentation">
                          {service.instrumentation === "unknown"
                            ? "Not verified"
                            : title(service.instrumentation)}
                        </MetadataListItem>
                        <MetadataListItem label="Last observation">
                          {service.lastObservedAt ? (
                            <Timestamp
                              value={service.lastObservedAt}
                              format="auto"
                              isLive
                            />
                          ) : (
                            "Not observed"
                          )}
                        </MetadataListItem>
                        <MetadataListItem label="Last outcome">
                          {title(service.outcome)}
                        </MetadataListItem>
                      </MetadataList>
                    </Collapsible>
                  ))}
                </CollapsibleGroup>
              ) : rows.length ? (
                <Table
                  data={rows}
                  idKey="id"
                  density="compact"
                  textOverflow="wrap"
                  columns={[
                    {
                      key: "service",
                      header: "Service",
                      width: proportional(1),
                      renderCell: (row) => (
                        <Text weight="semibold">{row.service}</Text>
                      ),
                    },
                    {
                      key: "state",
                      header: view === "metrics" ? "Metric" : "State",
                      width: proportional(1),
                      renderCell: (row) => (
                        <HStack gap={2} vAlign="center">
                          <StatusDot
                            label={row.state}
                            variant={
                              row.state === "Healthy" ||
                              row.state === "Resolved" ||
                              row.state === "Success"
                                ? "success"
                                : row.state === "Failed" ||
                                    row.state === "Failure"
                                  ? "error"
                                  : row.state === "Stale" ||
                                      row.state === "Disconnected"
                                    ? "warning"
                                    : "neutral"
                            }
                          />
                          <Text>{row.state}</Text>
                        </HStack>
                      ),
                    },
                    {
                      key: "details",
                      header: "Evidence",
                      width: proportional(2),
                      renderCell: (row) => row.details,
                    },
                  ]}
                />
              ) : (
                <VStack gap={2}>
                  <EmptyState
                    title={
                      unavailable
                        ? "Evidence unavailable"
                        : query.trim() && total > 0
                          ? "No matching results"
                          : "No observations yet"
                    }
                  />
                  {query.trim() && total > 0 && (
                    <Button
                      label="Clear search"
                      variant="ghost"
                      onClick={() => setQuery("")}
                    />
                  )}
                </VStack>
              )}
            </VStack>
          </VStack>
        </LayoutContent>
      }
    />
  );
}
function title(value: string) {
  const text = words(value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function Evidence({ at, id }: { at: string; id: string }) {
  return (
    <VStack gap={1}>
      <Timestamp value={at} format="auto" isLive />
      <Text type="code" style={{ overflowWrap: "anywhere" }}>
        {id}
      </Text>
    </VStack>
  );
}
