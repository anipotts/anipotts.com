import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowBendUpRightIcon,
  ArticleIcon,
  BellSimpleIcon,
  BriefcaseIcon,
  EnvelopeIcon,
  FileTextIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { CatalogRecord } from "../astryx/EditorialApp";
import { RecordStatus, Updated } from "../astryx/ContentLibrary";
import {
  AlertsTable,
  ConnectionNotice,
  OpsStateBadge,
  opsAlertRows,
  opsCountsSummary,
  opsView,
  useOpsData,
  type OpsViewProps,
} from "../astryx/ObservabilityWorkspace";
import { opsIsHost } from "../../lib/ops-v1";
import { LifeReadSession } from "../../lib/life-read-session";
import type { LifeResult } from "../../data/personal-context";
import { dataRecordHref } from "../../lib/data-routes";
import type { DataFixture } from "../../lib/data-fixture-reader";
import {
  DataTable,
  LoadingSkeleton,
  RelativeTime,
  RowTitle,
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

function contentGlyph(record: CatalogRecord): [Icon, string] {
  return record.collection === "projects"
    ? [BriefcaseIcon, "Project"]
    : record.collection === "writing"
      ? [ArticleIcon, "Article"]
      : record.href.startsWith("/newsletter/")
        ? [EnvelopeIcon, "Newsletter issue"]
        : [FileTextIcon, "Page"];
}

/** The library a record lives in, as the sidebar names it. */
function contentLibrary(record: CatalogRecord): string {
  return record.collection === "projects"
    ? "Projects"
    : record.collection === "writing"
      ? "Writing"
      : record.href.startsWith("/newsletter/")
        ? "Newsletter"
        : "Pages";
}

const SEE_ALL_ICON = (
  <ArrowBendUpRightIcon weight="regular" aria-hidden="true" />
);

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Button
      label={label}
      href={href}
      size="sm"
      variant="ghost"
      icon={SEE_ALL_ICON}
    />
  );
}

/** Firing alerts, then the health strip, from one ops read. */
function OpsSections(props: OpsViewProps) {
  const data = useOpsData(props, true);
  const connected = data.fixtureMode || data.state.connection === "connected";
  const firing = useMemo(
    () =>
      opsAlertRows(data.events, data.snapshot).filter(
        (row) => row.status === "firing",
      ),
    [data.events, data.snapshot],
  );
  const services = useMemo(
    () => (data.snapshot ? opsView(data.snapshot, data.stopped) : []),
    [data.snapshot, data.stopped],
  );
  const hosts = services.filter(opsIsHost);
  const failed = ["unreachable", "unavailable", "rejected", "denied", "ended"];
  const offline = data.fixtureMode ? null : data.state.connection === "off" ? (
    <StateNotice
      kind="not-connected"
      title="Not connected"
      description="Ops reads are switched off for this admin. Alerts and health appear here once they are enabled."
    />
  ) : failed.includes(data.state.connection) && !data.snapshot ? (
    <ConnectionNotice state={data.state} onRetry={data.retry} />
  ) : null;
  return (
    <>
      <WorkspaceSection
        title="Alerts"
        meta={connected && data.events ? `${firing.length} firing` : undefined}
        actions={<SeeAll href="/observability/alerts" label="All alerts" />}
      >
        {offline ??
          (!data.events || (!connected && !data.events.cursor) ? (
            <LoadingSkeleton label="alerts" rows={2} columns={3} />
          ) : firing.length ? (
            <AlertsTable rows={firing} compact />
          ) : (
            <StateNotice
              kind="empty"
              icon={BellSimpleIcon}
              title="No alerts firing"
              description="Every entry's latest state is ok, asleep or unknown."
            />
          ))}
      </WorkspaceSection>
      <WorkspaceSection
        title="Health"
        meta={
          data.snapshot
            ? data.stopped
              ? "Sampler stopped; last known values"
              : opsCountsSummary(services)
            : undefined
        }
        actions={<SeeAll href="/observability/status" label="Status" />}
      >
        {offline ? null : !data.snapshot ? (
          <LoadingSkeleton label="health" rows={1} columns={3} />
        ) : (
          <ul className="workspace-tiles" aria-label="Hosts">
            {hosts.map((host) => (
              <li key={host.id} className="workspace-tile">
                <HStack gap={2} hAlign="between" vAlign="center" wrap="wrap">
                  <Text weight="semibold">{host.name}</Text>
                  <OpsStateBadge state={host.status.state} />
                </HStack>
                <Text type="supporting" color="secondary">
                  {host.missingStatus
                    ? "No status row from System"
                    : host.status.detail}
                </Text>
              </li>
            ))}
            {(["failing", "degraded", "stale", "unknown", "ok"] as const).map(
              (state) => {
                const count = services.filter(
                  (service) =>
                    !opsIsHost(service) && service.status.state === state,
                ).length;
                return count ? (
                  <li key={state} className="workspace-tile">
                    <HStack gap={2} hAlign="between" vAlign="center">
                      <Text className="workspace-figure" weight="semibold">
                        {count} {count === 1 ? "service" : "services"}
                      </Text>
                      <OpsStateBadge state={state} />
                    </HStack>
                  </li>
                ) : null;
              },
            )}
          </ul>
        )}
      </WorkspaceSection>
    </>
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
  return (
    <WorkspaceSection
      title="Recent records"
      meta={session.fixture ? "Synthetic fixture" : undefined}
      actions={
        <HStack gap={2} vAlign="center">
          <DataSessionControl session={session} />
          <SeeAll href="/data/records" label="Records" />
        </HStack>
      }
    >
      {session.status !== "ready" ? (
        <SessionNotice session={session} />
      ) : !result ? (
        <LoadingSkeleton label="recent records" rows={3} columns={2} />
      ) : result.state !== "ready" ? (
        <StateNotice
          kind="error"
          title="Records could not be loaded"
          description="The source is unavailable. This does not mean your records are empty."
        />
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
                return (
                  <RowTitle
                    icon={glyph}
                    kind={kind}
                    title={String(item.title ?? "Untitled record")}
                    href={
                      typeof item.record_id === "string"
                        ? dataRecordHref(item.record_id)
                        : undefined
                    }
                    secondary={
                      typeof item.source_id === "string"
                        ? item.source_id
                        : undefined
                    }
                  />
                );
              },
            },
            {
              key: "tier",
              header: <Text className="sr-only">Tier</Text>,
              width: 44,
              render: (item) => (
                <TierSwatch
                  tier={typeof item.tier === "string" ? item.tier : null}
                />
              ),
            },
            {
              key: "observed",
              header: "Observed",
              width: 112,
              render: (item) => (
                <RelativeTime
                  value={
                    typeof item.observed_at === "string"
                      ? item.observed_at
                      : null
                  }
                />
              ),
            },
          ]}
        />
      ) : (
        <StateNotice kind="empty" title="No records yet" />
      )}
    </WorkspaceSection>
  );
}

function RecentContent({ records }: { records: CatalogRecord[] }) {
  return (
    <WorkspaceSection
      title="Recent content"
      actions={<SeeAll href="/content/pages" label="Content" />}
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
                const [glyph, kind] = contentGlyph(item);
                return (
                  <RowTitle
                    icon={glyph}
                    kind={kind}
                    title={item.title}
                    href={item.href}
                    secondary={contentLibrary(item)}
                    mobile={<Updated updated={item.updated} column />}
                  />
                );
              },
            },
            {
              key: "status",
              header: "State",
              width: 160,
              hideBelow: 1024,
              render: (item) => (
                <RecordStatus
                  status={item.status}
                  changesPending={item.changesPending}
                />
              ),
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
        <StateNotice kind="empty" title="No content yet" />
      )}
    </WorkspaceSection>
  );
}

/**
 * The one overview: firing alerts first, then health, then the most recent
 * Content and Data. Each part keeps its own gate: ops reads behind the ops
 * flag, Data behind its private session.
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
  return (
    <div className="admin-overview operations-workspace">
      <WorkspacePage title="Overview">
        <VStack gap={8}>
          <OpsSections {...ops} />
          <RecentContent records={content} />
          <RecentData enabled={dataEnabled} fixture={dataFixture} />
        </VStack>
      </WorkspacePage>
    </div>
  );
}
