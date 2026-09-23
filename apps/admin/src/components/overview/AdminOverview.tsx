import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowClockwiseIcon,
  BrowserIcon,
  BriefcaseIcon,
  EnvelopeSimpleIcon,
  LinkBreakIcon,
  PencilSimpleIcon,
  PencilSimpleLineIcon,
  PlugsIcon,
  ShieldWarningIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { CatalogRecord } from "../astryx/EditorialApp";
import {
  AlertsTable,
  opsAlertRows,
  opsEntryHref,
  useOpsData,
  type OpsViewProps,
} from "../astryx/ObservabilityWorkspace";
import { opsUnreadTitle } from "../observability/frame";
import { UnverifiedBadge } from "../observability/cells";
import { opsServices } from "../../lib/ops-v1";
import { opsUnverified } from "../../lib/ops-view";
import type { OpsStatusState } from "../../lib/ops-reader";
import { READER_HOP_TITLES } from "../../lib/reader-reach";
import { DataReadSession } from "../../lib/data-read-session";
import type { DataResult } from "../../data/personal-context";
import { dataRecordHref } from "../../lib/data-routes";
import type { DataFixture } from "../../lib/data-fixture-reader";
import type { PrivateReaderSession } from "../../lib/private-reader-client";
import {
  CELL_WIDTHS,
  DataTable,
  LoadingSkeleton,
  RelativeTime,
  RowTitle,
  SampleBadge,
  StateBadge,
  StateNotice,
  WorkspacePage,
  WorkspaceSection,
} from "../workspace/Workspace";
import { useDataSession } from "../data/useDataSession";
import { ReadNotice, SessionNotice } from "../data/DataNotices";
import { recordColumns } from "../data/RecordsView";
import { parseItems, parseRecord } from "../data/data-model";
import { SourceNamesContext, useSourceNames } from "../data/source-catalog";
import "./overview.css";

/** A Content record's type, with the glyph its sidebar library uses. */
function contentType(record: CatalogRecord): [Icon, string] {
  return record.collection === "projects" ||
    record.href.startsWith("/content/projects/")
    ? [BriefcaseIcon, "Project"]
    : record.collection === "writing" ||
        record.href.startsWith("/content/writing/")
      ? [PencilSimpleIcon, "Writing"]
      : record.href.startsWith("/newsletter/") ||
          record.href.startsWith("/content/newsletter/")
        ? [EnvelopeSimpleIcon, "Newsletter"]
        : [BrowserIcon, "Page"];
}

type Down = { title: string; icon?: Icon; kind: "not-connected" | "error" };

/** Ops reads that failed, as one notice in place of the alerts. A reader
 * that is switched off, connecting or fine says nothing here. An
 * unreachable reader names the hop that failed (A-26). */
function opsDown(state: OpsStatusState): Down | undefined {
  switch (state.connection) {
    case "unissued":
      return {
        title: READER_HOP_TITLES.unissued,
        icon: PlugsIcon,
        kind: "error",
      };
    case "unreachable":
      return {
        title: READER_HOP_TITLES[state.hop ?? "reader"],
        icon: LinkBreakIcon,
        kind: "not-connected",
      };
    case "unavailable":
      return { title: "No current snapshot", kind: "error" };
    case "rejected":
      return { title: "Snapshot rejected", kind: "error" };
    case "denied":
      return {
        title: "Access refused",
        icon: ShieldWarningIcon,
        kind: "error",
      };
    case "ended":
      return { title: "Session ended", kind: "not-connected" };
    default:
      return undefined;
  }
}

/**
 * Firing alerts only, and nothing at all when everything is clear. They are
 * the Alerts page's own rows, so each opens its alert in admin, where the
 * runbook is. When ops cannot be read the section says so instead of
 * reading as all clear, and an entry never proven (a restore drill that
 * never ran) is named Unverified, since that is not clear either.
 */
function FiringAlerts(props: OpsViewProps) {
  const data = useOpsData(props, true);
  const firing = useMemo(
    () =>
      opsAlertRows(data.events, data.snapshot).filter(
        (row) => row.status === "firing",
      ),
    [data.events, data.snapshot],
  );
  const unverified = useMemo(
    () =>
      data.snapshot ? opsServices(data.snapshot).filter(opsUnverified) : [],
    [data.snapshot],
  );
  const down: Down | undefined =
    (data.fixtureMode ? undefined : opsDown(data.state)) ??
    // An unread event may have been a failure, so no silence reads as clear.
    ((data.events?.skipped ?? 0) > 0
      ? { title: opsUnreadTitle(data.events!.skipped), kind: "error" }
      : undefined);
  if (!firing.length && !down && !unverified.length) return null;
  return (
    <WorkspaceSection title="Alerts" href="/observability/alerts">
      {down && (
        <StateNotice
          kind={down.kind}
          icon={down.icon}
          title={down.title}
          action={
            data.retry ? (
              <Button
                label="Try again"
                size="sm"
                variant="secondary"
                icon={
                  <ArrowClockwiseIcon weight="regular" aria-hidden="true" />
                }
                onClick={data.retry}
              />
            ) : undefined
          }
        />
      )}
      {unverified.length > 0 && (
        <a
          className="overview-unverified"
          href={opsEntryHref(unverified[0]!.id)}
          title={unverified.map((service) => service.name).join(", ")}
        >
          <UnverifiedBadge count={unverified.length} />
        </a>
      )}
      {firing.length > 0 && (
        // The overview runs on the real clock, as its content and records
        // do, so every age on the page and its clock agree; a fixture's
        // alerts are aged from now, not from the fixture's own moment.
        <AlertsTable rows={firing} now={props.now} />
      )}
    </WorkspaceSection>
  );
}

/** A content row's non-default state as its chip, then unpublished changes
 * as a glyph at the column's end, named for hover and assistive technology,
 * as a record's tier is. Both fit the state column whole at every width
 * (ledger A-29): "Draft" and "Changes pending" as two chips did not. */
function ContentState({ record }: { record: CatalogRecord }) {
  return (
    <span className="overview-state">
      <StateBadge domain="content" state={record.status} />
      {record.changesPending && (
        <span
          className="overview-pending"
          role="img"
          aria-label="Changes pending"
          title="Changes pending"
        >
          <PencilSimpleLineIcon weight="regular" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

function RecentContent({ records }: { records: CatalogRecord[] }) {
  return (
    <WorkspaceSection title="Recent content" href="/content/pages">
      {records.length ? (
        <DataTable
          rows={records}
          rowKey="href"
          label="Recently updated content"
          noun={["record", "records"]}
          footer={false}
          columns={[
            {
              key: "title",
              header: "Title",
              render: (item) => {
                const [glyph, type] = contentType(item);
                return (
                  <RowTitle
                    icon={glyph}
                    kind={type}
                    title={item.title}
                    href={item.href}
                    mobile={<ContentState record={item} />}
                    time={item.updated?.at}
                  />
                );
              },
            },
            {
              key: "status",
              header: "State",
              width: CELL_WIDTHS.state,
              render: (item) => <ContentState record={item} />,
            },
            {
              key: "updated",
              header: "Updated",
              width: CELL_WIDTHS.time,
              render: (item) => <RelativeTime value={item.updated?.at} />,
            },
          ]}
        />
      ) : (
        <StateNotice kind="empty" title="No content yet" />
      )}
    </WorkspaceSection>
  );
}

const RECENT = 5;

function RecentRecords({
  enabled,
  fixture,
  session: injected,
  fetch: fetcher,
}: {
  enabled: boolean;
  fixture?: DataFixture;
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
}) {
  const session = useDataSession({
    enabled,
    fixture,
    session: injected,
    fetch: fetcher,
  });
  const [result, setResult] = useState<DataResult | null>(null);
  const names = useSourceNames(session.reader);
  const read = useRef(new DataReadSession());
  useEffect(() => {
    setResult(null);
    if (!session.reader) return;
    const current = read.current;
    void current
      .run(session.reader, { method: "search", q: "", offset: 0 })
      .then((next) => next && setResult(next));
    return () => current.invalidate();
  }, [session.reader]);
  const items =
    result?.state === "ready"
      ? parseItems(result.data, parseRecord).slice(0, RECENT)
      : [];
  return (
    <WorkspaceSection title="Recent records" href="/data/records">
      {session.status !== "ready" ? (
        <SessionNotice session={session} label="recent records" />
      ) : !result ? (
        <LoadingSkeleton label="recent records" rows={3} columns={3} />
      ) : result.state !== "ready" ? (
        <ReadNotice result={result} />
      ) : items.length ? (
        <SourceNamesContext value={names}>
          <DataTable
            rows={items}
            rowKey="id"
            label="Recent records"
            noun={["record", "records"]}
            footer={false}
            columns={recordColumns({ href: (item) => dataRecordHref(item.id) })}
          />
        </SourceNamesContext>
      ) : (
        <StateNotice kind="empty" title="No records yet" />
      )}
    </WorkspaceSection>
  );
}

/**
 * The one overview: firing alerts (only when something fires, or when ops
 * cannot be read), then the most recent Content and Data. Ops keep their own
 * gate; Data opens its private session on its own.
 */
export function AdminOverview({
  content,
  dataEnabled,
  dataFixture,
  session,
  fetch: fetcher,
  ...ops
}: {
  content: CatalogRecord[];
  dataEnabled: boolean;
  dataFixture?: DataFixture;
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
} & OpsViewProps) {
  const sample = Boolean(dataFixture || ops.fixture);
  return (
    <div className="admin-overview">
      <WorkspacePage
        title="Overview"
        badge={
          sample ? (
            // Only the alerts can be a replay; records are the samples.
            <SampleBadge
              from={ops.fixture !== undefined ? ["snapshot", "events"] : []}
            />
          ) : undefined
        }
      >
        <VStack gap={8}>
          <FiringAlerts {...ops} />
          <RecentContent records={content} />
          <RecentRecords
            enabled={dataEnabled}
            fixture={dataFixture}
            session={session}
            fetch={fetcher}
          />
        </VStack>
      </WorkspacePage>
    </div>
  );
}
