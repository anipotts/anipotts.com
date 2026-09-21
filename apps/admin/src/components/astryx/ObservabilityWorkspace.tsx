import React, { useEffect, useMemo, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { StatusDot, type StatusDotVariant } from "@astryxdesign/core/StatusDot";
import {
  Table,
  proportional,
  useTableGroupedRows,
} from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowClockwiseIcon,
  ClockCounterClockwiseIcon,
  LinkBreakIcon,
  MoonIcon,
  PlugsIcon,
  ShieldWarningIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import {
  OPS_V1_STATES,
  formatDuration,
  opsFreshness,
  opsIsHost,
  opsOrdered,
  opsRenderedCounts,
  opsRunbookHref,
  opsSamplerStopped,
  opsServices,
  opsSnapshotAge,
  parseOpsSnapshot,
  type OpsServiceView,
  type OpsSnapshot,
  type OpsState,
} from "../../lib/ops-v1";
import {
  useOpsStatus,
  type OpsStatusController,
  type OpsStatusState,
} from "../../lib/ops-reader";
import "./operations-workspace.css";

/**
 * The state is always spoken as text. The dot adds colour for sighted
 * scanning and is hidden from assistive technology. Neither `unknown` nor
 * `asleep` ever takes the ok treatment. `asleep` (ap-pro at night) is calm:
 * a moon in place of the dot and a quiet label, so it reads apart from both
 * failing and unknown.
 */
export const STATE_PRESENTATION: Record<
  OpsState,
  { label: string; variant: StatusDotVariant }
> = {
  ok: { label: "OK", variant: "success" },
  degraded: { label: "Degraded", variant: "warning" },
  failing: { label: "Failing", variant: "error" },
  stale: { label: "Stale", variant: "warning" },
  asleep: { label: "Asleep", variant: "neutral" },
  unknown: { label: "Unknown", variant: "neutral" },
};

function StateLabel({ state }: { state: OpsState }) {
  const { label, variant } = STATE_PRESENTATION[state];
  if (state === "asleep")
    return (
      <HStack gap={2} vAlign="center" className="ops-state" data-state={state}>
        <MoonIcon
          weight="regular"
          aria-hidden="true"
          className="ops-asleep-mark"
        />
        <Text color="secondary">{label}</Text>
      </HStack>
    );
  return (
    <HStack gap={2} vAlign="center" className="ops-state" data-state={state}>
      <StatusDot label={label} variant={variant} aria-hidden="true" />
      <Text weight="semibold">{label}</Text>
    </HStack>
  );
}

function ago(seconds: number) {
  return seconds < 5 ? "just now" : `${formatDuration(seconds)} ago`;
}

function Freshness({ service, now }: { service: OpsServiceView; now: number }) {
  const freshness = opsFreshness(service, now);
  if (freshness.kind === "never")
    return <Text color="secondary">No success recorded</Text>;
  return (
    <VStack gap={1}>
      <Text>{ago(freshness.ageSeconds)}</Text>
      {freshness.kind === "liveness" ? (
        // A null budget is never judged stale: services by liveness, and
        // irregular jobs (health ingest follows phone use) by age alone.
        <Text type="supporting" color="secondary">
          {service.kind === "service" ? "Liveness only" : "No freshness budget"}
        </Text>
      ) : freshness.overBudget ? (
        <Text type="supporting" weight="semibold">
          Over its {formatDuration(freshness.budgetSeconds)} budget
        </Text>
      ) : (
        <Text type="supporting" color="secondary">
          Within its {formatDuration(freshness.budgetSeconds)} budget
        </Text>
      )}
    </VStack>
  );
}

function Detail({ service }: { service: OpsServiceView }) {
  return (
    <Text type="supporting" color="secondary">
      {service.missingStatus
        ? "No status row from System"
        : service.status.detail}
    </Text>
  );
}

type Row = OpsServiceView & Record<string, unknown>;

function StatusTable({ services, now }: { services: Row[]; now: number }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const grouped = useTableGroupedRows<Row>({
    data: services,
    groupBy: (row) => row.group,
    getRowKey: (row) => row.id,
    collapsedGroups: collapsed,
    onToggleGroup: (key) =>
      setCollapsed((previous) => {
        const next = new Set(previous);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    renderGroupHeader: (group, count) => (
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Text weight="semibold">{group}</Text>
        <Text type="supporting" color="secondary">
          {count} {count === 1 ? "entry" : "entries"}
        </Text>
      </HStack>
    ),
  });
  return (
    <Table
      data={grouped.data}
      idKey={grouped.idKey}
      plugins={{ grouped: grouped.plugin }}
      aria-label="Services by group"
      className="editorial-record-table ops-status-table"
      density="compact"
      dividers="none"
      textOverflow="wrap"
      columns={[
        {
          key: "name",
          header: "Service",
          width: proportional(2),
          renderCell: (row) => (
            <VStack gap={1}>
              <Text weight="semibold">{row.name}</Text>
              <Text type="code" size="sm" color="secondary" className="ops-id">
                {row.id}
              </Text>
              <VStack gap={1} className="ops-mobile-status">
                <StateLabel state={row.status.state} />
                <Detail service={row} />
                <Freshness service={row} now={now} />
                <Runbook service={row} />
              </VStack>
            </VStack>
          ),
        },
        {
          key: "state",
          header: "State",
          width: proportional(2),
          renderCell: (row) => (
            <VStack gap={1}>
              <StateLabel state={row.status.state} />
              <Detail service={row} />
            </VStack>
          ),
        },
        {
          key: "last_success",
          header: "Last success",
          width: proportional(2),
          renderCell: (row) => <Freshness service={row} now={now} />,
        },
        // Schedule is optional in ops_v1; the column shows only when at
        // least one entry carries it.
        ...(services.some((row) => row.schedule)
          ? [
              {
                key: "schedule",
                header: "Schedule",
                width: proportional(1),
                renderCell: (row: Row) =>
                  row.schedule ? (
                    <Text>{row.schedule}</Text>
                  ) : (
                    <Text color="secondary">Not set</Text>
                  ),
              },
            ]
          : []),
        {
          key: "last_exit",
          header: "Last exit",
          width: proportional(1),
          renderCell: (row) =>
            row.status.last_exit === null ? (
              <Text color="secondary">None</Text>
            ) : (
              <Text type="code" size="sm">
                {row.status.last_exit}
              </Text>
            ),
        },
        {
          key: "owner",
          header: "Owner",
          width: proportional(1),
          renderCell: (row) => <Text>{row.owner}</Text>,
        },
        {
          key: "runbook",
          header: "Runbook",
          width: proportional(1),
          renderCell: (row) => <Runbook service={row} />,
        },
      ]}
    />
  );
}

function Runbook({ service }: { service: OpsServiceView }) {
  return (
    <Link
      href={opsRunbookHref(service.runbook)}
      isExternalLink
      referrerPolicy="no-referrer"
      className="ops-runbook"
      aria-label={`Runbook for ${service.name}`}
    >
      Runbook
    </Link>
  );
}

function HostStrip({ hosts, now }: { hosts: OpsServiceView[]; now: number }) {
  if (!hosts.length) return null;
  return (
    <ul className="ops-host-strip" aria-label="Hosts">
      {hosts.map((host) => {
        const freshness = opsFreshness(host, now);
        return (
          <li key={host.id} className="ops-host" data-state={host.status.state}>
            <VStack gap={2}>
              <Text weight="semibold">{host.name}</Text>
              <StateLabel state={host.status.state} />
              <Detail service={host} />
              <Text type="supporting" color="secondary">
                {freshness.kind === "never"
                  ? "No success recorded"
                  : `Last success ${ago(freshness.ageSeconds)}`}
              </Text>
            </VStack>
          </li>
        );
      })}
    </ul>
  );
}

function Summary({
  services,
  lastKnown,
}: {
  services: OpsServiceView[];
  lastKnown: boolean;
}) {
  const counts = opsRenderedCounts(services);
  const parts = OPS_V1_STATES.filter((state) => counts[state] > 0).map(
    (state) =>
      `${counts[state]} ${STATE_PRESENTATION[state].label.toLowerCase()}`,
  );
  const entries = `${services.length} ${services.length === 1 ? "entry" : "entries"}`;
  return (
    <Text color="secondary" className="ops-summary">
      {lastKnown
        ? `${entries}, none current until the sampler resumes`
        : `${entries}: ${parts.join(", ")}`}
    </Text>
  );
}

/**
 * Once the sampler stops, no value is current and none may read as ok:
 * every entry shows as unknown, with what System last reported kept as
 * detail.
 */
function asLastKnown(service: OpsServiceView): OpsServiceView {
  const was = STATE_PRESENTATION[service.status.state].label;
  return {
    ...service,
    status: {
      ...service.status,
      state: "unknown",
      detail: service.missingStatus
        ? "No status row from System"
        : `Last known ${was.toLowerCase()}: ${service.status.detail}`,
    },
    missingStatus: false,
  };
}

function SnapshotView({
  snapshot,
  now,
  lastKnown,
}: {
  snapshot: OpsSnapshot;
  now: number;
  lastKnown: boolean;
}) {
  const services = useMemo(() => {
    const ordered = opsOrdered(opsServices(snapshot));
    return lastKnown ? ordered.map(asLastKnown) : ordered;
  }, [snapshot, lastKnown]);
  const hosts = services.filter(opsIsHost);
  const rows = services.filter((service) => !opsIsHost(service)) as Row[];
  return (
    <VStack gap={5}>
      <Summary services={services} lastKnown={lastKnown} />
      <HostStrip hosts={hosts} now={now} />
      {rows.length ? (
        <div className="admin-table-surface ops-status-surface">
          <StatusTable services={rows} now={now} />
        </div>
      ) : (
        <EmptyState headingLevel={2} title="No services in the catalog" />
      )}
    </VStack>
  );
}

const retryable = new Set([
  "unreachable",
  "unavailable",
  "rejected",
  "denied",
  "ended",
]);

function ConnectionNotice({
  state,
  onRetry,
}: {
  state: OpsStatusState;
  onRetry?: () => void;
}) {
  const retry = onRetry ? (
    <Button
      label={state.connection === "ended" ? "Open again" : "Try again"}
      variant="secondary"
      icon={<ArrowClockwiseIcon weight="regular" aria-hidden="true" />}
      onClick={onRetry}
    />
  ) : undefined;
  switch (state.connection) {
    case "off":
      return (
        <EmptyState
          headingLevel={2}
          title="Not connected"
          description="The ops reader is switched off. Status appears here once ops reads are enabled for this admin."
          icon={<PlugsIcon weight="regular" />}
        />
      );
    case "idle":
    case "connecting":
      return state.snapshot ? null : (
        <Text role="status" color="secondary">
          Connecting to the reader on ap-mini
        </Text>
      );
    case "unreachable":
      return state.snapshot ? (
        <Banner
          status="warning"
          container="section"
          title="Reader unreachable"
          description="The last read failed. Everything below is the last snapshot the reader confirmed, not current state."
          icon={<LinkBreakIcon weight="regular" />}
          endContent={retry}
        />
      ) : (
        <EmptyState
          headingLevel={2}
          title="Not connected"
          description="The reader on ap-mini could not be reached."
          icon={<LinkBreakIcon weight="regular" />}
          actions={retry}
        />
      );
    case "unavailable":
      return state.snapshot ? (
        <Banner
          status="warning"
          container="section"
          title="No current snapshot"
          description="The reader on ap-mini has no valid ops_v1 snapshot right now. Everything below is the last one it served."
          icon={<WarningCircleIcon weight="regular" />}
          endContent={retry}
        />
      ) : (
        <EmptyState
          headingLevel={2}
          title="No snapshot yet"
          description="The reader on ap-mini answered, but it has no valid ops_v1 snapshot to serve."
          icon={<WarningCircleIcon weight="regular" />}
          actions={retry}
        />
      );
    case "rejected":
      return (
        <Banner
          status="error"
          container="section"
          title="Snapshot rejected"
          description="The reader sent data outside the ops_v1 contract, so none of it is shown."
          icon={<WarningCircleIcon weight="regular" />}
          endContent={retry}
        />
      );
    case "denied":
      return (
        <Banner
          status="error"
          container="section"
          title="Access refused"
          description="The owner gate refused issuance, or the reader refused the credential because it lacks ops:read. Nothing was read."
          icon={<ShieldWarningIcon weight="regular" />}
          endContent={retry}
        />
      );
    case "ended":
      return (
        <Banner
          status="info"
          container="section"
          title="Session ended"
          description="The snapshot was cleared from this page."
          endContent={retry}
        />
      );
    default:
      return null;
  }
}

/**
 * The clock for ages. It starts at the server's render time so hydration
 * matches, then ticks while the tab is visible. A fixed clock never ticks.
 */
function useNow(fixed?: number, renderedAt?: number) {
  const [now, setNow] = useState(() => fixed ?? renderedAt ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    const tick = () => {
      if (!document.hidden) setNow(Date.now());
    };
    tick();
    const timer = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [fixed]);
  return now;
}

/**
 * Observability Status: System's ops_v1 snapshot, read-only. Hosts sit in a
 * strip on top; every other catalog entry is one table grouped by its group.
 *
 * `enabled` is true only when the server's PRIVATE_READER_ENABLED and
 * PRIVATE_READER_OPS_ENABLED flags are both "true". `fixture` is the
 * development-only preview of System's synthetic sample and never ships.
 */
export function ObservabilityWorkspace({
  enabled,
  fixture,
  controller,
  now: fixedNow,
  renderedAt,
}: {
  enabled: boolean;
  fixture?: unknown;
  controller?: OpsStatusController;
  /** Test seam for a fixed clock. */
  now?: number;
  /** Server render time, so the first client render matches the markup. */
  renderedAt?: number;
}) {
  const preview = useMemo(() => {
    if (fixture === undefined) return null;
    try {
      return parseOpsSnapshot(fixture);
    } catch {
      return null;
    }
  }, [fixture]);
  const { state, controller: live } = useOpsStatus({
    enabled: enabled && fixture === undefined,
    controller,
  });
  const clock = useNow(fixedNow, renderedAt);
  // The sample is a moment in time: read it at its own generated_at.
  const now =
    preview && fixedNow === undefined
      ? Date.parse(preview.generated_at)
      : clock;
  const snapshot = preview ?? state.snapshot;
  const generatedAge = snapshot ? opsSnapshotAge(snapshot, now) : null;
  const stopped = snapshot ? opsSamplerStopped(snapshot, now) : false;
  const current = !preview && state.connection === "connected" && !stopped;
  return (
    <Layout
      className="admin-observability-layout operations-workspace"
      height="auto"
      padding={0}
      content={
        <LayoutContent label="Observability">
          <VStack gap={5}>
            <HStack
              gap={4}
              wrap="wrap"
              hAlign="between"
              vAlign="center"
              className="operations-header"
            >
              <Heading level={1}>Status</Heading>
              {generatedAge !== null && (
                <Text role="status" color="secondary">
                  {stopped
                    ? `Sampler stopped ${ago(generatedAge)}; last known values`
                    : `${
                        preview
                          ? "System sample fixture"
                          : current
                            ? "Live"
                            : "Not current"
                      }, generated ${ago(generatedAge)}`}
                </Text>
              )}
            </HStack>
            {stopped && generatedAge !== null && (
              <Banner
                status="warning"
                container="section"
                title={`Sampler stopped ${ago(generatedAge)}`}
                description="System has not written a snapshot in over 3 minutes. Every entry below is a last known value, shown as unknown, and none of it is current."
                icon={<ClockCounterClockwiseIcon weight="regular" />}
              />
            )}
            {!preview && (
              <ConnectionNotice
                state={state}
                onRetry={
                  live && retryable.has(state.connection)
                    ? () => live.start()
                    : undefined
                }
              />
            )}
            {snapshot && (
              <SnapshotView snapshot={snapshot} now={now} lastKnown={stopped} />
            )}
          </VStack>
        </LayoutContent>
      }
    />
  );
}
