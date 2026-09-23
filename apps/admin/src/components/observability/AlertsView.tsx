import React, { useMemo } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { BellSimpleIcon } from "@phosphor-icons/react";
import {
  OPS_PROBLEM_STATES,
  deriveOpsAlerts,
  opsTransitionsFrom,
  type OpsAlert,
  type OpsEventLog,
} from "../../lib/ops-events";
import { opsDistinctNames } from "../../lib/ops-view";
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
  leadWidth,
  type Column,
} from "../workspace/Workspace";
import {
  DeviceTile,
  AlertFor,
  AlertStart,
  EntryTile,
  OPS_WIDTHS,
  PastState,
  RunbookButton,
  entryKeep,
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
  /** The end of `name` a title keeps whole: its host, when two entries
   * share the name. */
  keep?: string;
  kind: string | null;
  host: string | null;
  runbook: string | null;
} & Record<string, unknown>;

/**
 * Alerts the snapshot shows that no transition opened (A-31): an entry in a
 * problem state whose episode began before the events held, or whose change
 * is not read yet. System keeps events 35 days, so a problem older than
 * that would otherwise leave Alerts reading "Nothing firing" while Status
 * shows it failing. Its start was never observed, so none is made up: it
 * started before the oldest event held when the entry has no transition in
 * the log, and is unknown otherwise.
 */
function unopenedAlerts(
  alerts: readonly OpsAlert[],
  events: OpsEventLog | null,
  snapshot: OpsSnapshot | null,
): OpsAlert[] {
  if (!snapshot) return [];
  const firing = new Set(
    alerts.filter((alert) => alert.status === "firing").map((a) => a.subject),
  );
  const changed = new Set(
    (events?.transitions ?? []).map((event) => event.subject),
  );
  const from = events ? opsTransitionsFrom(events) : null;
  return opsServices(snapshot)
    .filter(
      (service) =>
        !service.missingStatus &&
        OPS_PROBLEM_STATES.includes(service.status.state) &&
        !firing.has(service.id),
    )
    .map((service) => ({
      subject: service.id,
      status: "firing",
      state: service.status.state,
      peak: service.status.state,
      since: null,
      startedBefore: changed.has(service.id) ? null : from,
      resolvedAt: null,
      detail: service.status.detail,
      incidents:
        (alerts.find((alert) => alert.subject === service.id)?.incidents ?? 0) +
        1,
    }));
}

/** Alerts with the catalog's name, kind and runbook, firing first: those
 * from transitions, newest first, then those only the snapshot shows. */
export function opsAlertRows(
  events: OpsEventLog | null,
  snapshot: OpsSnapshot | null,
): AlertRow[] {
  const catalog = catalogOf(snapshot);
  const names = opsDistinctNames(snapshot?.catalog ?? []);
  const derived = deriveOpsAlerts(events?.transitions ?? []);
  const unopened = unopenedAlerts(derived, events, snapshot);
  // One row per entry: a problem the snapshot shows replaces the entry's
  // last resolved episode.
  const reopened = new Set(unopened.map((alert) => alert.subject));
  const alerts = [
    ...derived.filter((alert) => alert.status === "firing"),
    ...unopened,
    ...derived.filter(
      (alert) => alert.status === "resolved" && !reopened.has(alert.subject),
    ),
  ];
  return alerts.map((alert) => {
    const entry = catalog.get(alert.subject);
    return {
      ...alert,
      name: entry ? entryNaming(entry, names).name : alert.subject,
      keep: entry ? entryKeep(entry, names) : undefined,
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
 * how long it lasted (live while it fires) and what System says. Every
 * column but the name and the detail is sized to what it holds; the name
 * keeps room for the longest one in either table (`names`), and the detail
 * takes the rest, giving way first. Below large the detail is line 2.
 */
export function AlertsTable({
  rows,
  resolved = false,
  incidents = false,
  now,
  serverNow,
  selected,
  onSelect,
  names,
}: {
  rows: AlertRow[];
  /** Every name the page shows, so Firing and Resolved keep one name
   * column width and line up; the rows' own names otherwise. */
  names?: readonly string[];
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
  const leadRoom = leadWidth(names ?? rows.map((row) => row.name));
  // The incident tables size their state and times to what they hold; the
  // overview's summary keeps the kit's widths, so its columns line up with
  // every other overview section.
  const widths = incidents
    ? { state: OPS_WIDTHS.incident, time: OPS_WIDTHS.age }
    : { state: CELL_WIDTHS.state, time: CELL_WIDTHS.time };
  const lead: Column<AlertRow> = {
    key: "alert",
    header: "Alert",
    render: (row) => {
      // The row's name is already the one to show (with its host when two
      // entries share it); only the tiles come from naming.
      const naming = {
        ...entryNaming({
          id: row.subject,
          name: row.name,
          kind: row.kind,
          host: row.host,
        }),
        name: row.name,
      };
      return (
        <RowTitle
          mark={<EntryTile naming={naming} />}
          kind={entryKind(
            { id: row.subject, name: row.name, kind: row.kind },
            naming,
          )}
          title={row.name}
          keep={row.keep}
          // The incident tables show the device at every width (its column,
          // line 2 at medium, line 1's end on phones); the summary and the
          // list beside a panel only on phones.
          keepHidden={full ? "always" : "compact"}
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
          // As Status does: the time, then the device in a slot of its own
          // (empty for a host, whose tile is the device), so the tiles form
          // one column down a phone's rows.
          end={
            <>
              {incidents && !resolved ? (
                <AlertFor alert={row} now={now} serverNow={clock} />
              ) : resolved ? (
                <RelativeTime value={row.resolvedAt} now={now} />
              ) : (
                <AlertStart alert={row} now={now} />
              )}
              <span className="ops-device-slot">
                {naming.device && <DeviceTile device={row.host} />}
              </span>
            </>
          }
        />
      );
    },
  };
  const state: Column<AlertRow> = {
    key: "state",
    header: "State",
    width: widths.state,
    render: (row) => <AlertState row={row} />,
  };
  const since: Column<AlertRow> = {
    key: "since",
    header: full ? "Started" : "Since",
    width: widths.time,
    render: (row) => <AlertStart alert={row} now={now} />,
  };
  const resolvedAt: Column<AlertRow> = {
    key: "resolved",
    header: "Resolved",
    width: widths.time,
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
      width: OPS_WIDTHS.tile,
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
      // A firing alert has not ended: it has fired "For" so long, and only
      // a resolved one "Lasted".
      header: resolved ? "Lasted" : "For",
      width: OPS_WIDTHS.figure + 16,
      numeric: true,
      render: (row) => <AlertFor alert={row} now={now} serverNow={clock} />,
    },
    {
      key: "incidents",
      header: "Incidents",
      width: OPS_WIDTHS.figure + 16,
      numeric: true,
      hideBelow: "wide",
      render: (row) => <Figure value={row.incidents} />,
    },
    {
      key: "detail",
      header: "Detail",
      share: 0.6,
      reserve: leadRoom,
      hideBelow: "large",
      render: (row) =>
        row.detail ? <DetailText>{row.detail}</DetailText> : null,
    },
    {
      key: "runbook",
      header: <span className="sr-only">Runbook</span>,
      width: OPS_WIDTHS.lastTile + 16,
      render: (row) =>
        row.runbook ? (
          <RunbookButton path={row.runbook} iconOnly name={row.name} />
        ) : null,
    },
  ]);

  function table(columns: Column<AlertRow>[]) {
    // With the incident columns, a table too narrow to show its detail
    // whole moves it to line 2 (observability-workspace.css).
    return (
      <div className={full ? "ops-alerts" : undefined}>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey="subject"
          label={resolved ? "Resolved alerts" : "Firing alerts"}
          noun={["alert", "alerts"]}
          footer={false}
        />
      </div>
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
  // The names the incident tables draw: a shared name's host is its
  // device tile there.
  const names = useMemo(
    () =>
      rows.map((row) =>
        row.keep ? row.name.slice(0, -row.keep.length) : row.name,
      ),
    [rows],
  );
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
                    names={names}
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
                    names={names}
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
