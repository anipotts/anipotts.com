import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArticleIcon,
  BriefcaseIcon,
  EnvelopeIcon,
  FileTextIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { CatalogRecord } from "../astryx/EditorialApp";
import { RecordStatus, Updated } from "../astryx/ContentLibrary";
import {
  AlertsTable,
  opsAlertRows,
  useOpsData,
  type OpsViewProps,
} from "../astryx/ObservabilityWorkspace";
import { LifeReadSession } from "../../lib/life-read-session";
import type { LifeResult } from "../../data/personal-context";
import { dataRecordHref } from "../../lib/data-routes";
import type { DataFixture } from "../../lib/data-fixture-reader";
import {
  DataTable,
  KindBadge,
  LoadingSkeleton,
  RelativeTime,
  RowTitle,
  SampleBadge,
  StateNotice,
  TierSwatch,
  WorkspacePage,
  WorkspaceSection,
} from "../workspace/Workspace";
import { useDataSession } from "../data/useDataSession";
import {
  DataSessionControl,
  SessionNotice,
  recordKindGlyph,
} from "../data/DataWorkspace";

/** A Content record's type, as the sidebar names its library. */
export function contentType(record: CatalogRecord): [Icon, string] {
  return record.collection === "projects" ||
    record.href.startsWith("/content/projects/")
    ? [BriefcaseIcon, "Project"]
    : record.collection === "writing" ||
        record.href.startsWith("/content/writing/")
      ? [ArticleIcon, "Writing"]
      : record.href.startsWith("/newsletter/")
        ? [EnvelopeIcon, "Newsletter"]
        : [FileTextIcon, "Page"];
}

function ViewAll({ href }: { href: string }) {
  return <Button label="View all" href={href} size="sm" variant="ghost" />;
}

/** Firing alerts only; nothing at all when everything is clear. */
function FiringAlerts(props: OpsViewProps) {
  const data = useOpsData(props, true);
  const firing = useMemo(
    () =>
      opsAlertRows(data.events, data.snapshot).filter(
        (row) => row.status === "firing",
      ),
    [data.events, data.snapshot],
  );
  if (!firing.length) return null;
  return (
    <WorkspaceSection
      title="Alerts"
      actions={<ViewAll href="/observability/alerts" />}
    >
      <AlertsTable rows={firing} compact />
    </WorkspaceSection>
  );
}

function RecentContent({ records }: { records: CatalogRecord[] }) {
  return (
    <WorkspaceSection
      title="Recent content"
      actions={<ViewAll href="/content/pages" />}
    >
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
                    mobile={
                      <>
                        <KindBadge icon={glyph} label={type} />
                        <RecordStatus status={item.status} />
                      </>
                    }
                  />
                );
              },
            },
            {
              key: "type",
              header: "Type",
              width: 136,
              render: (item) => {
                const [glyph, type] = contentType(item);
                return <KindBadge icon={glyph} label={type} />;
              },
            },
            {
              key: "status",
              header: "State",
              width: 144,
              render: (item) => <RecordStatus status={item.status} />,
            },
            {
              key: "updated",
              header: "Updated",
              width: 112,
              render: (item) => <Updated updated={item.updated} column />,
            },
          ]}
        />
      ) : (
        <StateNotice kind="empty" title="No content yet." />
      )}
    </WorkspaceSection>
  );
}

function RecentData({
  enabled,
  fixture,
}: {
  enabled: boolean;
  fixture?: DataFixture;
}) {
  const session = useDataSession({ enabled, fixture });
  const [result, setResult] = useState<LifeResult | null>(null);
  const read = useRef(new LifeReadSession());
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
    result?.state === "ready" && Array.isArray(result.data.items)
      ? (result.data.items as Record<string, unknown>[]).slice(0, 5)
      : [];
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  return (
    <WorkspaceSection
      title="Recent records"
      actions={
        <>
          <DataSessionControl session={session} />
          <ViewAll href="/data/records" />
        </>
      }
    >
      {session.status !== "ready" ? (
        <SessionNotice session={session} />
      ) : !result ? (
        <LoadingSkeleton label="recent records" rows={3} columns={3} />
      ) : result.state !== "ready" ? (
        <StateNotice kind="error" title="Records could not be loaded." />
      ) : items.length ? (
        <DataTable
          rows={items}
          rowKey="record_id"
          label="Recent records"
          noun={["record", "records"]}
          footer={false}
          columns={[
            {
              key: "record",
              header: "Record",
              render: (item) => {
                const [glyph, kind] = recordKindGlyph(item.kind);
                const id = text(item.record_id);
                return (
                  <RowTitle
                    icon={glyph}
                    kind={kind}
                    title={text(item.title) ?? "Untitled record"}
                    href={id ? dataRecordHref(id) : undefined}
                    mobile={
                      <>
                        <KindBadge icon={glyph} label={kind} />
                        <TierSwatch tier={text(item.tier)} />
                      </>
                    }
                  />
                );
              },
            },
            {
              key: "kind",
              header: "Type",
              width: 136,
              render: (item) => {
                const [glyph, kind] = recordKindGlyph(item.kind);
                return <KindBadge icon={glyph} label={kind} />;
              },
            },
            {
              key: "tier",
              header: <Text className="sr-only">Tier</Text>,
              width: 44,
              render: (item) => <TierSwatch tier={text(item.tier)} />,
            },
            {
              key: "observed",
              header: "Observed",
              width: 112,
              render: (item) => <RelativeTime value={text(item.observed_at)} />,
            },
          ]}
        />
      ) : (
        <StateNotice kind="empty" title="No records yet." />
      )}
    </WorkspaceSection>
  );
}

/**
 * The one overview: firing alerts (only when something fires), then the most
 * recent Content and Data. Ops keep their own gate; Data opens its private
 * session on its own.
 */
export function AdminOverview({
  content,
  dataEnabled,
  dataFixture,
  ...ops
}: {
  content: CatalogRecord[];
  dataEnabled: boolean;
  dataFixture?: DataFixture;
} & OpsViewProps) {
  const sample = Boolean(dataFixture || ops.fixture);
  return (
    <div className="admin-overview operations-workspace">
      <WorkspacePage
        title="Overview"
        badge={sample ? <SampleBadge /> : undefined}
      >
        <VStack gap={8}>
          <FiringAlerts {...ops} />
          <RecentContent records={content} />
          <RecentData enabled={dataEnabled} fixture={dataFixture} />
        </VStack>
      </WorkspacePage>
    </div>
  );
}
