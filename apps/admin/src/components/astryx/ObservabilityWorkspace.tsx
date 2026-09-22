import React, { useEffect, useMemo } from "react";
import {
  BellSimpleIcon,
  PulseIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { opsServices } from "../../lib/ops-v1";
import { provideSearchEntries } from "../../lib/admin-search-index";
import type { AdminSearchResult } from "../../data/admin-search";
import {
  FixtureOriginContext,
  SAMPLE_ORIGIN,
  StateNotice,
} from "../workspace/Workspace";
import {
  OpsPage,
  OpsSkeleton,
  useOpsData,
  type OpsData,
  type OpsView,
  type OpsViewProps,
} from "../observability/frame";
import { entryNaming } from "../observability/cells";
import { StatusView, opsEntryHref } from "../observability/StatusView";
import { ActivityView } from "../observability/ActivityView";
import {
  AlertsView,
  opsAlertHref,
  opsAlertRows,
} from "../observability/AlertsView";
import { opsSelectionParam } from "../observability/selection";
import "./observability-workspace.css";

/**
 * Observability, read-only, on System's ops_v1 snapshot and ops_events_v1
 * feed. Status shows the hosts, every entry grouped by System group in
 * owner priority, and the synced apps with their freshness; a tapped entry
 * opens its facts, runs and changes beside the list (components/
 * observability). Activity lists the events by day with plumbing folded
 * away and bursts folded into one row. Alerts lists incidents, firing and
 * resolved, each opening in admin before its runbook.
 *
 * Every view reads the events: a state change or a finished run reads the
 * snapshot at once (lib/ops-reader.ts). Only exceptions carry a chip; ids
 * ride in tooltips; times are leaves on the one shared clock, and a fixture
 * or a test reads a fixed clock that never ticks.
 */
export {
  OPS_VIEW_TITLES,
  useOpsData,
  type OpsView,
  type OpsViewProps,
} from "../observability/frame";
export {
  AlertsTable,
  opsAlertHref,
  opsAlertParam,
  opsAlertRows,
  type AlertRow,
} from "../observability/AlertsView";
export { opsEntryHref } from "../observability/StatusView";

/** The entry a Status URL opens, when it names a well-formed catalog id. */
export function opsEntryParam(search: string): string | null {
  return opsSelectionParam(search, "entry");
}

/** The services this page has read, for the one command palette, withdrawn
 * when the page goes. One row per entry: a firing entry opens its alert's
 * detail, any other its Status panel. */
function useOpsSearchEntries(data: OpsData) {
  const entries = useMemo<AdminSearchResult[]>(() => {
    const firing = new Map(
      opsAlertRows(data.events, data.snapshot)
        .filter((alert) => alert.status === "firing")
        .map((alert) => [alert.subject, alert]),
    );
    const services = data.snapshot ? opsServices(data.snapshot) : [];
    const row = (
      id: string,
      label: string,
      keywords: string[],
    ): AdminSearchResult => ({
      id: `ops:${id}`,
      label,
      domain: "system",
      kind: firing.has(id) ? "alert" : "service",
      currentFact: "",
      source: "ops",
      freshness: "current",
      href: firing.has(id) ? opsAlertHref(id) : opsEntryHref(id),
      keywords: [id, ...keywords, ...(firing.has(id) ? ["alert"] : [])],
      icon: firing.has(id) ? BellSimpleIcon : PulseIcon,
    });
    const rows = services.map((service) =>
      row(service.id, entryNaming(service).name, [service.name, service.group]),
    );
    const listed = new Set(services.map((service) => service.id));
    for (const alert of firing.values())
      if (!listed.has(alert.subject))
        rows.push(row(alert.subject, alert.name, []));
    return rows;
  }, [data.snapshot, data.events]);
  useEffect(() => provideSearchEntries("observability", entries), [entries]);
}

/**
 * Observability's three views. `enabled` is true only when the server's
 * PRIVATE_READER_ENABLED and PRIVATE_READER_OPS_ENABLED flags are both
 * "true". Fixtures are the development-only previews and never ship.
 */
export function ObservabilityWorkspace(
  props: OpsViewProps & {
    view?: OpsView;
    alert?: string | null;
    /** The entry a Status URL opens (`?entry=`). */
    entry?: string | null;
  },
) {
  return (
    <FixtureOriginContext.Provider value={props.fixtureOrigin ?? SAMPLE_ORIGIN}>
      <ObservabilityPage {...props} />
    </FixtureOriginContext.Provider>
  );
}

function ObservabilityPage({
  view = "status",
  alert = null,
  entry = null,
  ...props
}: OpsViewProps & {
  view?: OpsView;
  alert?: string | null;
  entry?: string | null;
}) {
  const data = useOpsData(props, true);
  useOpsSearchEntries(data);
  // Activity and Alerts read the catalog for names and runbooks; with no
  // snapshot and no events there is nothing to show but the notice.
  const eventsRead =
    Boolean(data.events) &&
    (data.fixtureMode ||
      data.state.checkedAt !== null ||
      (data.events?.cursor ?? 0) > 0);
  const hasData = view === "status" ? Boolean(data.snapshot) : eventsRead;
  if (hasData && view === "status")
    return <StatusView data={data} initial={entry} />;
  if (hasData && view === "activity") return <ActivityView data={data} />;
  if (hasData && view === "alerts")
    return <AlertsView data={data} initial={alert} />;
  const waiting =
    !data.fixtureMode &&
    (data.state.connection === "idle" ||
      data.state.connection === "connecting" ||
      (view !== "status" &&
        data.state.connection === "connected" &&
        !data.state.eventsStale));
  return (
    <OpsPage data={data} view={view} retained={false}>
      {waiting && <OpsSkeleton view={view} />}
      {data.fixtureMode && (
        <StateNotice
          kind="error"
          icon={WarningCircleIcon}
          title="Fixture rejected"
        />
      )}
    </OpsPage>
  );
}
