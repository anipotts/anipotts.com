import React, { useEffect, useState, useRef } from "react";
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
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@astryxdesign/core/DropdownMenu";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import {
  MetadataList,
  MetadataListItem,
} from "@astryxdesign/core/MetadataList";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import {
  ArrowClockwiseIcon,
  ArrowsClockwiseIcon,
  DesktopTowerIcon,
  LaptopIcon,
} from "@phosphor-icons/react";
import type {
  ServiceObservation,
  ServiceState,
} from "../../lib/observability-model";
import "./operations-workspace.css";

const allowedViews = [
  "machines",
  "loops",
  "activity",
  "coverage",
  "traces",
  "metrics",
  "incidents",
];
const readView = (value: string | null) =>
  value && allowedViews.includes(value) ? value : "machines";
const loopIds = [
  "personalcontext-capture",
  "personalcontext-ingestion",
  "personalcontext-wiki",
  "personalcontext-backups",
  "personalcontext-collector",
  "delegate-collector",
];

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
  const [view, setView] = useState(readView(initialView));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<string | null>(null);
  const changeView = (next: string) => {
    if (!allowedViews.includes(next) || next === view) return;
    setView(next);
    setSelectedId(null);
    const url = new URL(location.href);
    url.searchParams.set("view", next);
    history.pushState(history.state, "", url);
    window.dispatchEvent(new Event("admin:workspace-navigation"));
  };
  useEffect(() => {
    const navigate = () => {
      setView(readView(new URL(location.href).searchParams.get("view")));
      setSelectedId(null);
    };
    window.addEventListener("popstate", navigate);
    return () => window.removeEventListener("popstate", navigate);
  }, []);
  useEffect(() => {
    if (selectedId) detailHeading.current?.focus({ preventScroll: true });
    else if (returnFocus.current) {
      const button = workspace.current?.querySelector<HTMLButtonElement>(
        `[data-service-id="${returnFocus.current}"]`,
      );
      (
        button ?? workspace.current?.querySelector<HTMLInputElement>("input")
      )?.focus();
      returnFocus.current = null;
    }
  }, [selectedId]);
  const closeDetails = () => {
    returnFocus.current = selectedId;
    setSelectedId(null);
  };
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const manualRefresh = useRef<() => void>(() => undefined);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setNow(Date.now());
    }, 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let stopped = false;
    let automatic = initial.status !== "unconfigured";
    let active: AbortController | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let nextAt = Date.now();
    const schedule = () => {
      clearTimeout(timer);
      if (!stopped && automatic && !document.hidden)
        timer = setTimeout(
          () => void refresh(false),
          Math.max(0, nextAt - Date.now()),
        );
    };
    // Only a refresh the owner asked for shows the button's loading state. An
    // automatic refresh updates the snapshot quietly, and the status sentence
    // speaks only when the connection state changes.
    let activeManual = false;
    async function refresh(manual: boolean) {
      if (stopped || document.hidden) return;
      if (active) {
        if (manual && !activeManual) {
          activeManual = true;
          setRefreshing(true);
        }
        return;
      }
      clearTimeout(timer);
      const request = new AbortController();
      active = request;
      activeManual = manual;
      if (manual) setRefreshing(true);
      const current = () =>
        !stopped && active === request && !request.signal.aborted;
      try {
        const response = await fetch("/api/admin/observability", {
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(5000)]),
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
        });
        if (!response.ok) {
          // An unread error body would hold the request open until abort.
          void response.body?.cancel().catch(() => undefined);
          throw new Error("unavailable");
        }
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
        if (!current()) return;
        setResult({ status: body.status, snapshot });
        setNow(Date.now());
        failures = 0;
        automatic = body.status === "connected";
        nextAt = Date.now() + 60000;
      } catch {
        if (!current()) return;
        failures++;
        // Read availability is separate from machine/loop evidence.
        setResult((previous) => ({ ...previous, status: "disconnected" }));
        nextAt =
          Date.now() + Math.min(300000, 60000 * 2 ** Math.min(failures - 1, 3));
      } finally {
        if (current()) {
          active = null;
          activeManual = false;
          setRefreshing(false);
          schedule();
        }
      }
    }
    const visibilityChanged = () => {
      setNow(Date.now());
      clearTimeout(timer);
      if (document.hidden) {
        if (active) {
          active.abort();
          active = null;
          activeManual = false;
          nextAt = Date.now();
          setRefreshing(false);
        }
      } else schedule();
    };
    manualRefresh.current = () => void refresh(true);
    document.addEventListener("visibilitychange", visibilityChanged);
    // The server rendered this snapshot moments ago. The first automatic read
    // waits a full interval instead of repeating it at mount.
    nextAt = Date.now() + 60000;
    schedule();
    return () => {
      stopped = true;
      active?.abort();
      clearTimeout(timer);
      manualRefresh.current = () => undefined;
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [initial.status]);
  const { snapshot, status } = result;
  const matches = (...values: string[]) =>
    values.join(" ").toLowerCase().includes(query.trim().toLowerCase());
  const isInventory = ["machines", "loops", "coverage"].includes(view);
  const inventory = snapshot.services.filter((service) =>
    view === "machines"
      ? service.id.startsWith("mac-")
      : view === "loops"
        ? loopIds.includes(service.id)
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
  const selected = isInventory
    ? inventory.find((service) => service.id === selectedId)
    : undefined;
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
                  {title(span.operation)}, {span.durationMs} ms
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
  const rows = evidenceRows;
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
      ref={workspace}
      className="admin-observability-layout operations-workspace"
      height="auto"
      padding={0}
      content={
        <LayoutContent label="Operations">
          <VStack gap={5}>
            <HStack
              gap={4}
              wrap="wrap"
              hAlign="between"
              vAlign="center"
              className="operations-header"
            >
              <Heading level={1}>
                {view === "machines" ? "Overview" : title(view)}
              </Heading>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Button
                  label={
                    status === "connected" ? "Refresh" : "Retry connection"
                  }
                  icon={<ArrowClockwiseIcon aria-hidden="true" />}
                  variant="ghost"
                  isLoading={refreshing}
                  isDisabled={refreshing}
                  onClick={() => manualRefresh.current()}
                />
              </HStack>
            </HStack>
            <HStack
              gap={2}
              wrap="wrap"
              vAlign="center"
              className="operations-source-status"
            >
              <StatusDot
                label={
                  status === "connected"
                    ? "Source connected"
                    : "Source unavailable"
                }
                variant={status === "connected" ? "success" : "neutral"}
                aria-hidden="true"
              />
              <Text role="status" color="secondary">
                {status === "connected"
                  ? "Source connected"
                  : status === "unconfigured"
                    ? "Live telemetry is not connected"
                    : "Latest read unavailable; showing last-known observations"}
              </Text>
              {snapshot.source === "live" && (
                <Text color="secondary">
                  Snapshot observed{" "}
                  <Timestamp value={snapshot.observedAt} format="auto" />
                </Text>
              )}
            </HStack>
            <HStack
              gap={3}
              wrap="wrap"
              vAlign="center"
              className="operations-toolbar"
            >
              <TextInput
                label={isInventory ? `Search ${view}` : "Search evidence"}
                isLabelHidden
                value={query}
                onChange={setQuery}
                placeholder={
                  isInventory
                    ? "Name or observed state"
                    : "Service, state, trace or evidence ID"
                }
                className="operations-search"
              />
              <DropdownMenu
                button={{
                  label: title(view),
                  tooltip: `View: ${title(view)}`,
                  size: "sm",
                  variant: "secondary",
                }}
              >
                <DropdownMenuRadioGroup
                  label="Operations view"
                  value={view}
                  onChange={changeView}
                >
                  {allowedViews.map((value) => (
                    <DropdownMenuRadioItem
                      key={value}
                      value={value}
                      label={title(value)}
                    />
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenu>
            </HStack>
            <HStack
              gap={6}
              vAlign="start"
              className="operations-master-detail"
              data-has-detail={Boolean(selected)}
            >
              <VStack
                gap={isInventory ? 0 : 3}
                className={`operations-results${isInventory ? " admin-table-surface" : ""}`}
                role="region"
                id="observability-panel"
                aria-label={title(view)}
              >
                {isInventory && services.length ? (
                  <Table
                    data={services}
                    idKey="id"
                    className="editorial-record-table operations-inventory-table"
                    aria-label={title(view)}
                    density="compact"
                    dividers="none"
                    hasHover
                    textOverflow="wrap"
                    plugins={{
                      details: {
                        transformBodyRow: (props, service) => ({
                          ...props,
                          htmlProps: {
                            ...props.htmlProps,
                            onClick: () => setSelectedId(service.id),
                          },
                        }),
                      },
                    }}
                    columns={[
                      {
                        key: "id",
                        header:
                          view === "machines"
                            ? "Machine"
                            : view === "loops"
                              ? "Loop"
                              : "Service",
                        width: proportional(2),
                        renderCell: (service) => (
                          <VStack gap={1} hAlign="start">
                            <Button
                              label={label(service.id)}
                              variant="ghost"
                              className="operations-service-name"
                              data-service-id={service.id}
                              aria-expanded={selectedId === service.id}
                              aria-controls={
                                selectedId === service.id
                                  ? "operations-service-detail"
                                  : undefined
                              }
                              icon={<ServiceIcon id={service.id} />}
                              onClick={() => setSelectedId(service.id)}
                            />
                            <HStack
                              gap={2}
                              vAlign="center"
                              wrap="wrap"
                              className="operations-mobile-status"
                            >
                              <StatusDot
                                label={stateLabel(service.id)}
                                variant={stateVariant(
                                  deriveServiceState(service, now),
                                )}
                                aria-hidden="true"
                              />
                              <Text type="supporting">
                                {stateLabel(service.id)}
                              </Text>
                              {service.lastObservedAt && (
                                <Text type="supporting" color="secondary">
                                  <Timestamp
                                    value={service.lastObservedAt}
                                    format="auto"
                                  />
                                </Text>
                              )}
                            </HStack>
                          </VStack>
                        ),
                      },
                      {
                        key: "outcome",
                        header: "Observed state",
                        width: proportional(1),
                        renderCell: (service) => (
                          <HStack gap={2} vAlign="center">
                            <StatusDot
                              label={stateLabel(service.id)}
                              variant={stateVariant(
                                deriveServiceState(service, now),
                              )}
                              aria-hidden="true"
                            />
                            <Text>{stateLabel(service.id)}</Text>
                          </HStack>
                        ),
                      },
                      {
                        key: "lastObservedAt",
                        header: "Last observation",
                        width: proportional(1),
                        renderCell: (service) =>
                          service.lastObservedAt ? (
                            <Timestamp
                              value={service.lastObservedAt}
                              format="auto"
                            />
                          ) : (
                            <Text color="secondary">Not observed</Text>
                          ),
                      },
                    ]}
                  />
                ) : !isInventory && rows.length ? (
                  <Table
                    data={rows}
                    idKey="id"
                    className="editorial-record-table operations-evidence-table"
                    density="compact"
                    dividers="none"
                    textOverflow="wrap"
                    columns={[
                      {
                        key: "service",
                        header: "Service",
                        width: proportional(1),
                        renderCell: (row) => (
                          <VStack gap={1}>
                            <Text weight="semibold">{row.service}</Text>
                            <HStack
                              gap={2}
                              vAlign="center"
                              className="operations-mobile-status"
                            >
                              <StatusDot
                                label={row.state}
                                variant={evidenceVariant(row.state)}
                                aria-hidden="true"
                              />
                              <Text type="supporting">{row.state}</Text>
                            </HStack>
                          </VStack>
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
                              variant={evidenceVariant(row.state)}
                              aria-hidden="true"
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
                {isInventory && (
                  <HStack
                    gap={5}
                    wrap="wrap"
                    vAlign="center"
                    className="admin-table-footer"
                  >
                    <Text
                      type="supporting"
                      color="secondary"
                      aria-live="polite"
                      role="status"
                      className="operations-count"
                    >
                      {services.length}{" "}
                      {services.length === 1 ? "record" : "records"}
                    </Text>
                  </HStack>
                )}
              </VStack>
              {selected && (
                <VStack
                  gap={4}
                  className="operations-service-detail"
                  role="region"
                  aria-labelledby="operations-detail-title"
                  id="operations-service-detail"
                  onKeyDown={(event) => {
                    if (
                      event.key === "Escape" &&
                      !event.defaultPrevented &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      closeDetails();
                    }
                  }}
                >
                  <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
                    <Heading
                      ref={detailHeading}
                      level={2}
                      id="operations-detail-title"
                      tabIndex={-1}
                    >
                      {label(selected.id)}
                    </Heading>
                    <Button
                      label="Close details"
                      variant="ghost"
                      onClick={closeDetails}
                    />
                  </HStack>
                  <HStack gap={2} vAlign="center">
                    <ServiceIcon id={selected.id} />
                    <StatusDot
                      label={stateLabel(selected.id)}
                      variant={stateVariant(deriveServiceState(selected, now))}
                      aria-hidden="true"
                    />
                    <Text>{stateLabel(selected.id)}</Text>
                  </HStack>
                  <MetadataList label={{ position: "top" }}>
                    <MetadataListItem label="Instrumentation">
                      {selected.instrumentation === "unknown"
                        ? "Not verified"
                        : title(selected.instrumentation)}
                    </MetadataListItem>
                    <MetadataListItem label="Observed connection">
                      {title(selected.connection)}
                    </MetadataListItem>
                    <MetadataListItem label="Last observation">
                      {selected.lastObservedAt ? (
                        <Timestamp
                          value={selected.lastObservedAt}
                          format="date_time"
                        />
                      ) : (
                        "Not observed"
                      )}
                    </MetadataListItem>
                    <MetadataListItem label="Freshness window">
                      {selected.freshnessSeconds} seconds
                    </MetadataListItem>
                    <MetadataListItem label="Last outcome">
                      {title(selected.outcome)}
                    </MetadataListItem>
                  </MetadataList>
                  {selected.lastObservedAt === null && (
                    <Text color="secondary">
                      No observation has been received for this{" "}
                      {view === "machines" ? "machine" : "service"}.
                    </Text>
                  )}
                </VStack>
              )}
            </HStack>
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

function ServiceIcon({ id }: { id: ServiceObservation["id"] }) {
  const Icon =
    id === "mac-local"
      ? LaptopIcon
      : id === "mac-mini"
        ? DesktopTowerIcon
        : ArrowsClockwiseIcon;
  return <Icon aria-hidden="true" className="operations-entity-icon" />;
}
function stateVariant(state: ServiceState) {
  return state === "healthy"
    ? "success"
    : state === "failed"
      ? "error"
      : state === "stale" || state === "disconnected"
        ? "warning"
        : "neutral";
}
function evidenceVariant(state: string) {
  return state === "Healthy" || state === "Resolved" || state === "Success"
    ? "success"
    : state === "Failed" || state === "Failure"
      ? "error"
      : state === "Stale" || state === "Disconnected"
        ? "warning"
        : "neutral";
}
