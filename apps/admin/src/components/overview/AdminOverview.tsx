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
  ShieldWarningIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { CatalogRecord } from "../astryx/EditorialApp";
import {
  AlertsTable,
  opsAlertRows,
  useOpsData,
  type OpsViewProps,
} from "../astryx/ObservabilityWorkspace";
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
 * that is switched off, connecting or fine says nothing here. */
const OPS_DOWN: Partial<Record<string, Down>> = {
  unreachable: {
    title: "ap-mini unreachable",
    icon: LinkBreakIcon,
    kind: "not-connected",
  },
  unavailable: { title: "No current snapshot", kind: "error" },
  rejected: { title: "Snapshot rejected", kind: "error" },
  denied: { title: "Access refused", icon: ShieldWarningIcon, kind: "error" },
  ended: { title: "Session ended", kind: "not-connected" },
};

/**
 * Firing alerts only, and nothing at all when everything is clear. They are
 * the Alerts page's own rows, so each opens its alert in admin, where the
 * runbook is. When ops cannot be read the section says so instead of
 * reading as all clear.
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
  const down = data.fixtureMode ? undefined : OPS_DOWN[data.state.connection];
  if (!firing.length && !down) return null;
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
      {firing.length > 0 && <AlertsTable rows={firing} now={data.fixedNow} />}
    </WorkspaceSection>
  );
}

/** A content row's non-default state, and unpublished changes. In the
 * state column the pair keeps to the column, the second chip giving way. */
function ContentState({ record }: { record: CatalogRecord }) {
  return (
    <span className="overview-state">
      <StateBadge domain="content" state={record.status} />
      {record.changesPending && (
        <StateBadge tone="neutral" label="Changes pending" />
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
        <DataTable
          rows={items}
          rowKey="id"
          label="Recent records"
          noun={["record", "records"]}
          footer={false}
          columns={recordColumns({ href: (item) => dataRecordHref(item.id) })}
        />
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
        badge={sample ? <SampleBadge /> : undefined}
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
