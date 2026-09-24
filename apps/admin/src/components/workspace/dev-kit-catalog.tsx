/**
 * The workspace kit on one page, for `astro dev` only (the dev catalog's
 * `?fixture=kit`): a Status table, day-grouped activity, sources with a
 * folded group and a record panel, drawn from an ops snapshot and events
 * page (System's sample, or a local replay of the live payloads) and from
 * synthetic source and record values. It is a reference for the pages that
 * use the kit, not a page of its own.
 */
import React from "react";
import { VStack } from "@astryxdesign/core/VStack";
import {
  opsRouteLabel,
  parseOpsEvents,
  type OpsEvent,
} from "../../lib/ops-events";
import { parseOpsSnapshot, type OpsSnapshot } from "../../lib/ops-v1";
import {
  deviceName,
  hostDevice,
  opsNaming,
  sourceNaming,
} from "../../lib/naming";
import { deviceMark } from "../../lib/marks";
import { BrandTile } from "../BrandTile";
import { sentenceCase } from "../../lib/sentence-case";
import { dayKey } from "./format";
import {
  CELL_WIDTHS,
  CompactTimeline,
  DataTable,
  DayLabel,
  DefinitionList,
  DetailPanel,
  DetailText,
  DueTime,
  Duration,
  Figure,
  RelativeTime,
  RowTitle,
  StateCell,
  StateTransition,
  TechnicalSection,
  ValueChips,
  WorkspacePage,
  WorkspaceSection,
  type Column,
} from "./Workspace";

type StatusRow = {
  id: string;
  name: string;
  kind: string;
  host: string;
  group: string;
  state: string;
  detail: string;
  success: string | null;
  next: string | null;
  duration: number | null;
  runs: number | null;
};

function Device({ id }: { id: string | null | undefined }) {
  const tile = hostDevice(id);
  return tile ? (
    <BrandTile id={tile.id} kind="device" size={20} label={deviceName(id)} />
  ) : null;
}

const statusColumns: Column<StatusRow>[] = [
  {
    key: "name",
    header: "Name",
    render: (row) => {
      const naming = opsNaming(row);
      return (
        <RowTitle
          mark={<BrandTile id={naming.tile.id} kind={naming.tile.kind} />}
          kind={naming.tooltip}
          title={naming.name}
          tooltip={naming.tooltip}
          onSelect={() => undefined}
          end={naming.device && <Device id={naming.device.id} />}
          mobile={
            row.state === "ok" ? undefined : (
              <StateCell domain="ops" state={row.state} />
            )
          }
          time={row.success}
        />
      );
    },
  },
  {
    key: "device",
    header: <span className="sr-only">Device</span>,
    width: CELL_WIDTHS.tile,
    hideBelow: "large",
    render: (row) =>
      row.kind === "host" ? null : <Device id={opsNaming(row).device?.id} />,
  },
  {
    key: "state",
    header: "State",
    width: CELL_WIDTHS.state,
    render: (row) => <StateCell domain="ops" state={row.state} />,
  },
  {
    key: "detail",
    header: "Detail",
    hideBelow: "large",
    render: (row) => <DetailText>{row.detail}</DetailText>,
  },
  {
    key: "success",
    header: "Last success",
    width: CELL_WIDTHS.time,
    render: (row) => <RelativeTime value={row.success} />,
  },
  {
    key: "next",
    header: "Next due",
    width: CELL_WIDTHS.time,
    hideBelow: "large",
    render: (row) => <DueTime value={row.next} />,
  },
  {
    key: "duration",
    header: "Duration",
    width: CELL_WIDTHS.figure,
    numeric: true,
    hideBelow: "wide",
    render: (row) => <Duration seconds={row.duration} />,
  },
  {
    key: "runs",
    header: "Runs",
    width: CELL_WIDTHS.figure,
    numeric: true,
    render: (row) => <Figure value={row.runs} />,
  },
];

type ActivityRow = { id: string; event: OpsEvent; name: string };

function eventTile(event: OpsEvent, snapshot: OpsSnapshot) {
  if (event.kind === "access") return deviceMark(event.device);
  const entry = snapshot.catalog.find((row) => row.id === event.subject);
  return opsNaming(entry ?? { id: event.subject, name: event.subject }).tile;
}

function activityColumns(snapshot: OpsSnapshot): Column<ActivityRow>[] {
  return [
    {
      key: "name",
      header: "Event",
      render: (row) => {
        const tile = eventTile(row.event, snapshot);
        return (
          <RowTitle
            mark={<BrandTile id={tile.id} kind={tile.kind} />}
            kind={row.event.subject}
            title={row.name}
            tooltip={row.event.subject}
            time={row.event.at}
          />
        );
      },
    },
    {
      key: "change",
      header: "Change",
      width: 232,
      hideBelow: "large",
      render: ({ event }) =>
        event.kind === "transition" ? (
          <StateTransition domain="ops" from={event.from} to={event.to} />
        ) : event.kind === "run" ? (
          <DetailText>
            {event.exit === null ? "Ran" : `Exit ${event.exit}`}
          </DetailText>
        ) : event.kind === "access" ? (
          <DetailText>{deviceName(event.device)}</DetailText>
        ) : null,
    },
    {
      key: "figure",
      header: "Took",
      width: CELL_WIDTHS.figure,
      numeric: true,
      render: ({ event }) =>
        event.kind === "run" || event.kind === "access" ? (
          <Duration ms={event.ms} />
        ) : null,
    },
    {
      key: "at",
      header: "When",
      width: CELL_WIDTHS.time,
      render: ({ event }) => <RelativeTime value={event.at} format="time" />,
    },
  ];
}

type SourceRow = {
  id: string;
  host: string | null;
  group: string;
  records: number;
  revisions: number;
  last: string | null;
};

const DISCOVERED = "Discovered, not connected";
const synthetic = Date.parse("2026-09-22T17:45:00Z");
const ago = (minutes: number) =>
  new Date(synthetic - minutes * 60_000).toISOString();
/** Synthetic source rows in System's id shapes: no personal data. */
const SOURCES: SourceRow[] = [
  {
    id: "ani-browsing",
    host: "ap-pro",
    group: "Live",
    records: 58,
    revisions: 61,
    last: ago(20),
  },
  {
    id: "ani-messages-1to1",
    host: "ap-pro",
    group: "Live",
    records: 4211,
    revisions: 4388,
    last: ago(12),
  },
  {
    id: "ani-contacts",
    host: "ap-pro",
    group: "Live",
    records: 912,
    revisions: 930,
    last: ago(600),
  },
  {
    id: "ani-voice-memos",
    host: "ap-pro",
    group: "Live",
    records: 140,
    revisions: 141,
    last: ago(700),
  },
  {
    id: "ani-github-ledger",
    host: "ap-mini",
    group: "Live",
    records: 305,
    revisions: 322,
    last: ago(180),
  },
  {
    id: "manual",
    host: null,
    group: "Live",
    records: 12,
    revisions: 14,
    last: ago(3000),
  },
  {
    id: "connection-graph",
    host: null,
    group: "Imported once",
    records: 1,
    revisions: 1,
    last: ago(9000),
  },
  {
    id: "notes-html-archive",
    host: null,
    group: "Imported once",
    records: 1740,
    revisions: 1740,
    last: ago(12000),
  },
  {
    id: "discovered-gmail-work",
    host: null,
    group: DISCOVERED,
    records: 0,
    revisions: 0,
    last: null,
  },
  {
    id: "discovered-calendar",
    host: null,
    group: DISCOVERED,
    records: 0,
    revisions: 0,
    last: null,
  },
  {
    id: "discovered-whatsapp-export",
    host: null,
    group: DISCOVERED,
    records: 0,
    revisions: 0,
    last: null,
  },
];

const sourceColumns: Column<SourceRow>[] = [
  {
    key: "name",
    header: "Source",
    render: (row) => {
      const naming = sourceNaming(row);
      return (
        <RowTitle
          mark={<BrandTile id={naming.tile.id} kind={naming.tile.kind} />}
          kind={naming.tooltip}
          title={naming.name}
          tooltip={naming.tooltip}
          href="#"
          end={naming.device && <Device id={naming.device.id} />}
          time={row.last}
        />
      );
    },
  },
  {
    key: "device",
    header: <span className="sr-only">Device</span>,
    width: CELL_WIDTHS.tile,
    hideBelow: "large",
    render: (row) => <Device id={row.host} />,
  },
  {
    key: "records",
    header: "Records",
    width: CELL_WIDTHS.figure,
    numeric: true,
    render: (row) => <Figure value={row.records} />,
  },
  {
    key: "revisions",
    header: "Revisions",
    width: CELL_WIDTHS.figure,
    numeric: true,
    hideBelow: "large",
    render: (row) => <Figure value={row.revisions} />,
  },
  {
    key: "last",
    header: "Last sync",
    width: CELL_WIDTHS.time,
    render: (row) => <RelativeTime value={row.last} empty="Never" />,
  },
];

function activityName(event: OpsEvent, snapshot: OpsSnapshot): string {
  if (event.kind === "access") return opsRouteLabel(event.subject);
  const entry = snapshot.catalog.find((row) => row.id === event.subject);
  return opsNaming(entry ?? { id: event.subject, name: event.subject }).name;
}

export function DevKitCatalog({
  ops,
  opsEvents,
  source,
}: {
  /** An ops_v1 snapshot and an ops_events_v1 page, as JSON. */
  ops: unknown;
  opsEvents: unknown;
  /** Where the ops values came from: "replay" or "sample". */
  source: string;
}) {
  const snapshot = parseOpsSnapshot(ops);
  const events = parseOpsEvents(opsEvents, 0).items;
  const status: StatusRow[] = snapshot.catalog.map((entry) => {
    const row = snapshot.status.get(entry.id);
    return {
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      host: entry.host,
      group: entry.group,
      state: row?.state ?? "unknown",
      detail: row?.detail ?? "No status row from System",
      success: row?.last_success_at ?? null,
      next: row?.next_run_at ?? null,
      duration: row?.last_duration_s ?? null,
      runs: row?.runs ?? null,
    };
  });
  const activity: ActivityRow[] = events
    .filter(
      (event) => !(event.kind === "access" && event.subject === "preflight"),
    )
    .slice(-40)
    .reverse()
    .map((event) => ({
      id: String(event.seq),
      event,
      name: activityName(event, snapshot),
    }));
  return (
    <VStack gap={8} className="dev-kit-catalog">
      <WorkspacePage title="Kit" meta={`Ops values: ${source}`} />
      <WorkspaceSection title="Status">
        <DataTable
          rows={status}
          columns={statusColumns}
          rowKey="id"
          label="Status"
          noun={["entry", "entries"]}
          groupBy={(row) => row.group}
          groupLabel={sentenceCase}
        />
      </WorkspaceSection>
      <WorkspaceSection title="Activity">
        <DataTable
          rows={activity}
          columns={activityColumns(snapshot)}
          rowKey="id"
          label="Activity"
          noun={["event", "events"]}
          interactive={false}
          groupBy={(row) => dayKey(row.event.at)}
          groupLabel={(key) => <DayLabel day={key} />}
        />
      </WorkspaceSection>
      <WorkspaceSection title="Sources">
        <DataTable
          rows={SOURCES}
          columns={sourceColumns}
          rowKey="id"
          label="Sources"
          noun={["source", "sources"]}
          groupBy={(row) => row.group}
          foldGroup={DISCOVERED}
        />
      </WorkspaceSection>
      <WorkspaceSection title="Record">
        <DetailPanel title="Browsing, Sep 22">
          <DefinitionList
            items={[
              ["Local date", "Sep 22, 2026"],
              ["Day", "Complete"],
              ["Visits", <Figure key="v" value={47} />],
              [
                "Browser visits",
                <ValueChips
                  key="b"
                  field="browser_visits"
                  value={{ chrome: 44, safari: 2, atlas: 1 }}
                />,
              ],
              [
                "Dropped visits",
                <ValueChips
                  key="d"
                  field="dropped_visits"
                  value={{ title_screened: 3, private_host: 1 }}
                />,
              ],
            ]}
          />
          <TechnicalSection
            items={[
              {
                label: "Record ID",
                value: "rec-00000000000000000000000000000042",
              },
              {
                label: "Source version",
                value:
                  "3f2a9c1b7d4e5f60718293a4b5c6d7e8f9011223344556677889900aabbccdd",
              },
              {
                label: "Source reference",
                value: "personal-context://browsing-day/2026-09-22",
              },
              { label: "Aggregation", value: "browser-day-rollup-v1" },
            ]}
          />
          <CompactTimeline
            label="Revision history"
            hashLabel="Source version"
            items={[
              {
                id: "r2",
                title: "Revision 2",
                at: "2026-09-22T15:30:00Z",
                hash: "9b1c0f5e2d7a4c3b8e6f1a2d3c4b5a697887766554433221100ffeeddccbbaa",
                current: true,
              },
              {
                id: "r1",
                title: "Revision 1",
                at: "2026-09-22T11:30:00Z",
                hash: "3f2a9c1b7d4e5f60718293a4b5c6d7e8f9011223344556677889900aabbccdd",
              },
            ]}
          />
        </DetailPanel>
      </WorkspaceSection>
    </VStack>
  );
}
