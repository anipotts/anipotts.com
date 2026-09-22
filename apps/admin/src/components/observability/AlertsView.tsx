import React, { useMemo } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { BellSimpleIcon } from "@phosphor-icons/react";
import type { OpsEventLog } from "../../lib/ops-events";
import { deriveOpsAlerts, type OpsAlert } from "../../lib/ops-events";
import { opsServices, type OpsSnapshot } from "../../lib/ops-v1";
import { SplitView, useSplitView } from "../astryx/SplitView";
import {
  CELL_WIDTHS,
  CompactOnly,
  DataTable,
  MediumOnly,
  DetailText,
  Figure,
  RelativeTime,
  RowTitle,
  StateBadge,
  StateCell,
  StateNotice,
  WorkspaceSection,
  type Column,
} from "../workspace/Workspace";
import {
  DeviceTile,
  EntryTile,
  Lasted,
  PastState,
  RunbookButton,
  entryKind,
  entryNaming,
} from "./cells";
import { EntryPanel, OPS_PANEL_ID } from "./EntryPanel";
import { OpsPage, catalogOf, type OpsData } from "./frame";
import {
  opsSelectionHref,
  opsSelectionParam,
  useOpsSelection,
} from "./selection";

const ALERTS_PATH = "/observability/alerts";

export type AlertRow = OpsAlert & {
  name: string;
  kind: string | null;
  host: string | null;
  runbook: string | null;
} & Record<string, unknown>;

/** Alerts with the catalog's name, kind and runbook, firing first. */
export function opsAlertRows(
  events: OpsEventLog | null,
  snapshot: OpsSnapshot | null,
): AlertRow[] {
  const catalog = catalogOf(snapshot);
  return deriveOpsAlerts(events?.transitions ?? []).map((alert) => {
    const entry = catalog.get(alert.subject);
    return {
      ...alert,
      name: entry ? entryNaming(entry).name : alert.subject,
      kind: entry?.kind ?? null,
      host: entry?.host ?? null,
      runbook: entry?.runbook ?? null,
    };
  });
}

/** An alert opens in admin first; its runbook is an action there. */
export function opsAlertHref(subject: string) {
  return opsSelectionHref(ALERTS_PATH, "alert", subject);
}

/** The alert a URL opens, when it names a well-formed catalog id. */
export function opsAlertParam(search: string): string | null {
  return opsSelectionParam(search, "alert");
}

/** An alert's state: a firing one's live chip (a quiet dot never shows,
 * since an alert is never ok); a resolved one's past state in muted words,
 * "was failing", so a past problem never reads as current. */
function AlertState({ row }: { row: AlertRow }) {
  return row.status === "firing" ? (
    <StateCell domain="ops" state={row.state} />
  ) : (
    <PastState state={row.peak} was />
  );
}

/**
 * Firing or resolved alerts as incidents, in the compact row every admin
 * table uses. The whole row opens the alert in admin (on the Alerts page, in
 * place); the runbook is the row's one action. Firing and Resolved share one
 * set of columns, so the two tables line up: the state (live for a firing
 * alert, "was failing" for a resolved one), when it started and resolved,
 * how long it lasted (live while it fires) and what System says. The detail
 * gives way before the alert's name, and drops to line 2 below large.
 */
export function AlertsTable({
  rows,
  resolved = false,
  incidents = false,
  now,
  serverNow,
  selected,
  onSelect,
}: {
  rows: AlertRow[];
  resolved?: boolean;
  /** The Alerts page's incident columns; without it the summary the
   * overview shows (alert, state, since). */
  incidents?: boolean;
  now?: number;
  /** The server render's clock, so a live duration hydrates in step. */
  serverNow?: number;
  selected?: string | null;
  onSelect?: (subject: string, trigger: HTMLElement) => void;
}) {
  const clock = serverNow ?? now ?? Date.now();
  // Beside an open panel the list keeps the alert, its state and its time.
  const beside = useSplitView();
  const narrow = beside && Boolean(selected);
  const full = incidents && !narrow;
  const lead: Column<AlertRow> = {
    key: "alert",
    header: "Alert",
    render: (row) => {
      const naming = entryNaming({
        id: row.subject,
        name: row.name,
        kind: row.kind,
        host: row.host,
      });
      return (
        <RowTitle
          mark={<EntryTile naming={naming} />}
          kind={entryKind(
            { id: row.subject, name: row.name, kind: row.kind },
            naming,
          )}
          title={row.name}
          href={opsAlertHref(row.subject)}
          onSelect={
            onSelect ? (trigger) => onSelect(row.subject, trigger) : undefined
          }
          isPressed={onSelect ? selected === row.subject : undefined}
          controls={
            onSelect && selected === row.subject ? OPS_PANEL_ID : undefined
          }
          tooltip={row.detail ? `${row.subject}\n${row.detail}` : row.subject}
          mobile={
            <>
              {naming.device && (
                <MediumOnly>
                  <DeviceTile device={row.host} />
                </MediumOnly>
              )}
              <CompactOnly>
                {row.status === "firing" ? (
                  <StateBadge domain="ops" state={row.state} />
                ) : (
                  <PastState state={row.peak} was />
                )}
              </CompactOnly>
              {row.detail && (
                <span className="ops-reason">
                  <DetailText>{row.detail}</DetailText>
                </span>
              )}
            </>
          }
          mobileBelow={full ? "large" : "compact"}
          end={
            <>
              {naming.device && <DeviceTile device={row.host} />}
              {incidents && !resolved ? (
                <Lasted
                  from={row.since}
                  to={row.resolvedAt}
                  now={now}
                  serverNow={clock}
                />
              ) : (
                <RelativeTime
                  value={resolved ? row.resolvedAt : row.since}
                  now={now}
                />
              )}
            </>
          }
        />
      );
    },
  };
  const state: Column<AlertRow> = {
    key: "state",
    header: "State",
    width: CELL_WIDTHS.state,
    render: (row) => <AlertState row={row} />,
  };
  const since: Column<AlertRow> = {
    key: "since",
    header: full ? "Started" : "Since",
    width: CELL_WIDTHS.time,
    render: (row) => <RelativeTime value={row.since} now={now} />,
  };
  const resolvedAt: Column<AlertRow> = {
    key: "resolved",
    header: "Resolved",
    width: CELL_WIDTHS.time,
    render: (row) =>
      row.resolvedAt ? (
        <RelativeTime value={row.resolvedAt} now={now} />
      ) : (
        <span className="sr-only">Still firing</span>
      ),
  };
  if (narrow) return table([lead, state, resolved ? resolvedAt : since]);
  if (!incidents) return table([lead, state, since]);
  return table([
    lead,
    {
      key: "device",
      header: <span className="sr-only">Device</span>,
      width: CELL_WIDTHS.tile,
      // Below large the tile leads line 2, so names keep the width.
      hideBelow: "large",
      render: (row) =>
        entryNaming({
          id: row.subject,
          name: row.name,
          kind: row.kind,
          host: row.host,
        }).device ? (
          <DeviceTile device={row.host} />
        ) : null,
    },
    state,
    since,
    { ...resolvedAt, hideBelow: "large" },
    {
      key: "lasted",
      header: "Lasted",
      width: CELL_WIDTHS.figure + 16,
      numeric: true,
      render: (row) => (
        <Lasted
          from={row.since}
          to={row.resolvedAt}
          now={now}
          serverNow={clock}
        />
      ),
    },
    {
      key: "incidents",
      header: "Incidents",
      width: CELL_WIDTHS.figure,
      numeric: true,
      hideBelow: "wide",
      render: (row) => <Figure value={row.incidents} />,
    },
    {
      key: "detail",
      header: "Detail",
      share: 0.4,
      hideBelow: "large",
      render: (row) =>
        row.detail ? <DetailText>{row.detail}</DetailText> : null,
    },
    {
      key: "runbook",
      header: <span className="sr-only">Runbook</span>,
      width: CELL_WIDTHS.tile + 8,
      render: (row) =>
        row.runbook ? (
          <RunbookButton path={row.runbook} iconOnly name={row.name} />
        ) : null,
    },
  ]);

  function table(columns: Column<AlertRow>[]) {
    return (
      <DataTable
        rows={rows}
        columns={columns}
        rowKey="subject"
        label={resolved ? "Resolved alerts" : "Firing alerts"}
        noun={["alert", "alerts"]}
        footer={false}
      />
    );
  }
}

export function AlertsView({
  data,
  initial,
}: {
  data: OpsData;
  initial: string | null;
}) {
  const rows = useMemo(
    () => opsAlertRows(data.events, data.snapshot),
    [data.events, data.snapshot],
  );
  const { selected, open, close, panel } = useOpsSelection(initial, {
    path: ALERTS_PATH,
    param: "alert",
  });
  const firing = rows.filter((row) => row.status === "firing");
  const resolved = rows.filter((row) => row.status === "resolved");
  const current = selected
    ? rows.find((row) => row.subject === selected)
    : undefined;
  const service = useMemo(
    () =>
      current && data.snapshot
        ? (opsServices(data.snapshot).find(
            (entry) => entry.id === current.subject,
          ) ?? null)
        : null,
    [current, data.snapshot],
  );
  const shownSelection = current ? selected : null;
  return (
    <OpsPage data={data} view="alerts" retained>
      {rows.length ? (
        <SplitView
          className="ops-split"
          list={
            <VStack gap={6}>
              <WorkspaceSection
                title="Firing"
                meta={firing.length ? String(firing.length) : undefined}
              >
                {firing.length ? (
                  <AlertsTable
                    rows={firing}
                    incidents
                    now={data.fixedNow}
                    serverNow={data.serverNow}
                    selected={shownSelection}
                    onSelect={open}
                  />
                ) : (
                  <StateNotice
                    kind="empty"
                    icon={BellSimpleIcon}
                    title="Nothing firing"
                  />
                )}
              </WorkspaceSection>
              {resolved.length > 0 && (
                <WorkspaceSection
                  title="Resolved"
                  meta={String(resolved.length)}
                >
                  <AlertsTable
                    rows={resolved}
                    resolved
                    incidents
                    now={data.fixedNow}
                    serverNow={data.serverNow}
                    selected={shownSelection}
                    onSelect={open}
                  />
                </WorkspaceSection>
              )}
            </VStack>
          }
          panel={
            current && (
              <EntryPanel
                key={current.subject}
                service={service}
                alert={current}
                data={data}
                onClose={close}
                panelRef={panel}
                backLabel="Back to alerts"
              />
            )
          }
        />
      ) : (
        <StateNotice kind="empty" icon={BellSimpleIcon} title="No alerts" />
      )}
    </OpsPage>
  );
}
