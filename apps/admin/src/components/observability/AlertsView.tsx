import React, { useMemo } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { BellSimpleIcon } from "@phosphor-icons/react";
import {
  OPS_PROBLEM_STATES,
  deriveOpsAlerts,
  opsTransitionsFrom,
  worse,
  type OpsAlert,
  type OpsEventLog,
} from "../../lib/ops-events";
import { opsDetailText, opsDistinctNames } from "../../lib/ops-view";
import {
  opsServices,
  type OpsServiceView,
  type OpsSnapshot,
} from "../../lib/ops-v1";
import { SplitView } from "../astryx/SplitView";
import {
  CELL_WIDTHS,
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
  YieldOnly,
  badgeFor,
  figureWidth,
  leadWidth,
  stateWidth,
  titleWidth,
  type Column,
} from "../workspace/Workspace";
import {
  DeviceTile,
  AlertFor,
  AlertStart,
  alertStartText,
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
      detail: opsDetailText(service),
      incidents:
        (alerts.find((alert) => alert.subject === service.id)?.incidents ?? 0) +
        1,
    }));
}

/**
 * A firing alert as the snapshot reads now (A-31). System writes a
 * transition only when a state changes, so the opening transition's detail
 * freezes ("disk 85% used") while the entry's own reading moves on ("disk
 * 89% used"). While the snapshot shows the entry in a problem state, the
 * alert takes that state and detail; the transitions keep their own in the
 * entry's Changes. A resolved alert keeps what its episode said.
 */
function current(
  alert: OpsAlert,
  services: ReadonlyMap<string, OpsServiceView>,
  newer: boolean,
): OpsAlert | null {
  if (alert.status !== "firing") return alert;
  const service = services.get(alert.subject);
  if (!service || service.missingStatus) return alert;
  const state = service.status.state;
  if (OPS_PROBLEM_STATES.includes(state))
    return {
      ...alert,
      state,
      peak: worse(alert.peak, state),
      detail: opsDetailText(service),
    };
  // The snapshot read after the alert's last change says otherwise: it is
  // not firing as Status shows it. Ok has recovered, its change not read
  // yet (it lists again once the ok transition arrives, as resolved);
  // unknown is unknown, never a problem still claimed.
  if (!newer) return alert;
  if (state === "ok") return null;
  return { ...alert, state, detail: opsDetailText(service) };
}

/** Alerts with the catalog's name, kind and runbook, firing first: those
 * from transitions, newest first, then those only the snapshot shows. */
export function opsAlertRows(
  events: OpsEventLog | null,
  snapshot: OpsSnapshot | null,
): AlertRow[] {
  const catalog = catalogOf(snapshot);
  const names = opsDistinctNames(snapshot?.catalog ?? []);
  const services = new Map(
    (snapshot ? opsServices(snapshot) : []).map((service) => [
      service.id,
      service,
    ]),
  );
  // When each entry last changed, so the snapshot overrides a firing alert
  // only once it was read after that change.
  const changedAt = new Map<string, string>();
  for (const event of events?.transitions ?? []) {
    const at = changedAt.get(event.subject);
    if (!at || event.at > at) changedAt.set(event.subject, event.at);
  }
  const generated = snapshot?.generated_at ?? "";
  const derived = deriveOpsAlerts(events?.transitions ?? []).flatMap(
    (alert) => {
      // An entry System no longer watches never fires on forever under its
      // raw id: no later ok can ever arrive for it.
      if (alert.status === "firing" && snapshot && !catalog.has(alert.subject))
        return [];
      const read = current(
        alert,
        services,
        generated > (changedAt.get(alert.subject) ?? ""),
      );
      return read ? [read] : [];
    },
  );
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
/** The Started column's width on the Alerts page: an age ("23h ago") by
 * default, or the widest "Before Sep 22, 17:26" a row with an unobserved
 * start reads, so that bound is never cut (A-31). Firing and Resolved share
 * it, so their columns line up. */
export function alertStartWidth(
  rows: readonly OpsAlert[],
  now: number = Date.now(),
): number {
  let widest = 0;
  for (const row of rows) {
    const text = alertStartText(row, now);
    // A time draws its digits in tabular numerals, wider than a
    // proportional "1", so "Before Sep 11, 11:11" is measured at them.
    if (text) widest = Math.max(widest, figureWidth(text));
  }
  return widest
    ? Math.max(OPS_WIDTHS.age, Math.ceil(START_CHROME + widest))
    : OPS_WIDTHS.age;
}

/** A time cell's inset. */
const START_CHROME = 24;

/** The State column's width on the Alerts page: its widest cell, a firing
 * alert's chip or a resolved one's "was degraded", so a table of short
 * chips gives the name the rest. Firing and Resolved share it. */
export function alertStateWidth(rows: readonly OpsAlert[]): number {
  return stateWidth(
    "ops",
    rows.filter((row) => row.status === "firing").map((row) => row.state),
    rows
      .filter((row) => row.status !== "firing")
      .map((row) =>
        titleWidth(`was ${badgeFor("ops", row.peak).label.toLowerCase()}`),
      ),
  );
}

/** The widest "Seen ..." a bounded start reads in a short column, "Seen
 * just now" or "Seen 999d ago", with a last column's 28px of insets. */
const SEEN_WIDTH = Math.ceil(
  28 + Math.max(figureWidth("Seen just now"), figureWidth("Seen 999d ago")),
);

/** The runbook column: its 36px glyph button and an 8px end inset, so the
 * glyph ends on the table's 16px edge. */
const RUNBOOK_WIDTH = 44;

export function AlertsTable({
  rows,
  resolved = false,
  incidents = false,
  now,
  serverNow,
  selected,
  onSelect,
  names,
  startWidth,
  stateColumnWidth,
}: {
  rows: AlertRow[];
  /** The State column's width (alertStateWidth), shared by the page's
   * tables; this table's own rows' otherwise. */
  stateColumnWidth?: number;
  /** The Started column's width (alertStartWidth), shared by the page's
   * tables; this table's own rows' otherwise. */
  startWidth?: number;
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
  // Below 960px an open panel is the page and the list steps aside
  // (styles/shell.css), so an open panel always means the short list, and
  // the server writes the layout the browser keeps.
  const narrow = Boolean(selected);
  const full = incidents && !narrow;
  const leadRoom = leadWidth(names ?? rows.map((row) => row.name));
  // The incident tables size their state and times to what they hold; the
  // overview's summary keeps the kit's widths, so its columns line up with
  // every other overview section.
  const widths = incidents
    ? {
        state: stateColumnWidth ?? alertStateWidth(rows),
        time: OPS_WIDTHS.age,
        start: startWidth ?? alertStartWidth(rows, clock),
      }
    : {
        state: CELL_WIDTHS.state,
        time: CELL_WIDTHS.time,
        start: CELL_WIDTHS.time,
      };
  const lead: Column<AlertRow> = {
    key: "alert",
    header: "Alert",
    // The incident columns give way to the name: State moves to line 2,
    // then Started goes (For still says how long).
    room: full ? leadRoom : undefined,
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
          // A name two Macs share carries its host in words at every width:
          // the device tile beside it is too small to tell them apart.
          keep={row.keep}
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
              <YieldOnly column="state">
                {row.status === "firing" ? (
                  <StateBadge domain="ops" state={row.state} />
                ) : (
                  <PastState state={row.peak} was />
                )}
              </YieldOnly>
              {row.detail && (
                <span className="ops-reason">
                  <DetailText lines={2}>{row.detail}</DetailText>
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
                // How long it has fired; with no observed start, when it
                // was seen.
                row.since ? (
                  <AlertFor alert={row} now={now} serverNow={clock} />
                ) : (
                  <AlertStart alert={row} now={now} seen />
                )
              ) : resolved ? (
                <RelativeTime value={row.resolvedAt} now={now} />
              ) : (
                <AlertStart alert={row} now={now} seen />
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
    yieldOrder: full ? 1 : undefined,
    render: (row) => <AlertState row={row} />,
  };
  // The short columns (the overview's, and the list beside a panel) say a
  // bound as "Seen 7h ago", which an age's width cannot hold: the widest it
  // can read, at tabular digits, with the last column's 12px and 16px insets.
  const bounded = rows.some((row) => !row.since && row.startedBefore);
  const since: Column<AlertRow> = {
    key: "since",
    header: full ? "Started" : "Since",
    width: full
      ? widths.start
      : bounded
        ? Math.max(widths.time, SEEN_WIDTH)
        : widths.time,
    yieldOrder: full ? 2 : undefined,
    render: (row) => <AlertStart alert={row} now={now} seen={!full} />,
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
      // Beside the rail at large the column drops (a container query) and
      // the detail is line 2, so it asks no least width of its own.
      min: 0,
      hideBelow: "large",
      render: (row) =>
        row.detail ? <DetailText lines={2}>{row.detail}</DetailText> : null,
    },
    {
      key: "runbook",
      header: <span className="sr-only">Runbook</span>,
      width: RUNBOOK_WIDTH,
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
  const startWidth = alertStartWidth(rows, data.fixedNow ?? data.serverNow);
  const stateColumnWidth = alertStateWidth(rows);
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
                    startWidth={startWidth}
                    stateColumnWidth={stateColumnWidth}
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
                    startWidth={startWidth}
                    stateColumnWidth={stateColumnWidth}
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
