import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import {
  ToggleButton,
  ToggleButtonGroup,
} from "@astryxdesign/core/ToggleButton";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowBendUpLeftIcon,
  ArrowClockwiseIcon,
  BrainIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  dataRecordHref,
  knowledgeEntityHref,
  knowledgeHref,
  type KnowledgeRoute,
} from "../../lib/data-routes";
import type { PrivateReaderSession } from "../../lib/private-reader-client";
import { PrivateReaderError } from "../../lib/private-reader-fetch";
import { READER_HOP_TITLES, ReaderNoReplyError } from "../../lib/reader-reach";
import {
  ENTITY_KINDS,
  KNOWLEDGE_KINDS,
  KnowledgeContractError,
  createFixtureKnowledgeReader,
  createPrivateKnowledgeReader,
  entityKind,
  type Entity,
  type EntitySummary,
  type KnowledgeFixture,
  type KnowledgeReader,
} from "../../lib/private-reader-knowledge";
import { sharedPrivateSession } from "../../lib/private-session-store";
import { SplitPanel, SplitView, useSplitView } from "../astryx/SplitView";
import {
  CELL_WIDTHS,
  DataTable,
  DefinitionList,
  FilterBar,
  Figure,
  LoadingSkeleton,
  RelativeTime,
  RowTitle,
  SampleBadge,
  StateNotice,
  EasternClock,
  WorkspacePage,
  type Column,
} from "../workspace/Workspace";
import { ADMIN_TIME_ZONE } from "../workspace/format";
import { kindGlyph } from "./data-model";
import {
  DataSessionControl,
  SessionNotice,
  type DataNavigate,
} from "./DataNotices";
import { useDataSession } from "./useDataSession";
import "./data-workspace.css";
import "./knowledge.css";

/**
 * Data Knowledge, the life wiki: one page per person, project, place or
 * topic, derived from records. The list searches live and filters by kind
 * with the same chips as Records; an entity opens beside the list once the
 * view is wide enough (components/astryx/SplitView.tsx), and is the page
 * otherwise. Every fact, timeline entry and backlink opens its record.
 *
 * Off (PRIVATE_READER_KNOWLEDGE_ENABLED unset, as in production) the view is
 * one "not built yet" notice and makes no request. System serves no wiki
 * freshness route yet, so there is no freshness badge to show beside it.
 */

type Failure = { title: string };

function failureOf(error: unknown): Failure {
  if (error instanceof KnowledgeContractError)
    return { title: "Unreadable response" };
  if (error instanceof PrivateReaderError) {
    if (error.failure === "forbidden" || error.failure === "unauthorized")
      return { title: "Access refused" };
    if (error.failure === "not_found") return { title: "Not served yet" };
    if (error.failure === "malformed") return { title: "Unreadable response" };
  }
  // Which hop failed (A-26): only a request that got no reply names ap-mini.
  if (error instanceof ReaderNoReplyError)
    return { title: READER_HOP_TITLES[error.hop] };
  return { title: READER_HOP_TITLES.reader };
}

const kindName = (kind: string) =>
  entityKind(kind)
    ? KNOWLEDGE_KINDS[entityKind(kind)!].one
    : kindGlyph(kind)[1];

function KindChips({
  route,
  navigate,
  disabled,
}: {
  route: KnowledgeRoute;
  navigate: DataNavigate;
  disabled?: boolean;
}) {
  return (
    <div className="data-chips">
      <ToggleButtonGroup
        label="Entity kind"
        size="sm"
        isDisabled={disabled}
        value={route.kind}
        onChange={(value) =>
          navigate(knowledgeHref(entityKind(value)), { replace: true })
        }
      >
        {ENTITY_KINDS.map((kind) => {
          const [Glyph] = kindGlyph(kind);
          return (
            <ToggleButton
              key={kind}
              value={kind}
              label={KNOWLEDGE_KINDS[kind].label}
              icon={<Glyph weight="regular" aria-hidden="true" />}
            />
          );
        })}
      </ToggleButtonGroup>
    </div>
  );
}

type Row = EntitySummary & Record<string, unknown>;

function EntityList({
  reader,
  route,
  navigate,
  onCount,
}: {
  reader: KnowledgeReader;
  route: KnowledgeRoute;
  navigate: DataNavigate;
  onCount: (count: number | undefined) => void;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<EntitySummary[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const reads = useRef(0);
  async function load(offset: number) {
    const token = ++reads.current;
    setBusy(true);
    try {
      const page = await reader.list({ kind: route.kind, q, offset });
      if (token !== reads.current) return;
      setFailure(null);
      setItems((previous) =>
        offset === 0 ? page.items : [...(previous ?? []), ...page.items],
      );
      setNext(page.nextOffset);
      onCount(page.total ?? undefined);
    } catch (error) {
      if (token !== reads.current) return;
      setFailure(failureOf(error));
      if (offset === 0) {
        setItems([]);
        onCount(undefined);
      }
    } finally {
      if (token === reads.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load(0);
    // The kind and the query are the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader, route.kind, q]);
  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Name",
      render: (entity) => {
        const [Glyph] = kindGlyph(entity.kind);
        return (
          <RowTitle
            icon={Glyph}
            kind={kindName(entity.kind)}
            title={entity.name}
            tooltip={entity.id}
            href={knowledgeEntityHref(entity.id, route.kind)}
            isPressed={entity.id === route.id}
            onSelect={() =>
              navigate(knowledgeEntityHref(entity.id, route.kind))
            }
            secondary={entity.summary || undefined}
            time={entity.lastSeenAt}
          />
        );
      },
    },
    {
      key: "records",
      header: "Records",
      width: CELL_WIDTHS.figure,
      numeric: true,
      hideBelow: "large",
      render: (entity) => <Figure value={entity.records} />,
    },
    {
      key: "seen",
      header: "Last seen",
      width: CELL_WIDTHS.time,
      render: (entity) => <RelativeTime value={entity.lastSeenAt} />,
    },
  ];
  let body: React.ReactNode;
  if (!items) body = <LoadingSkeleton label="entities" columns={3} />;
  else if (failure && !items.length)
    body = (
      <StateNotice
        kind="error"
        title={failure.title}
        action={
          <Button
            label="Try again"
            size="sm"
            variant="secondary"
            icon={<ArrowClockwiseIcon weight="regular" aria-hidden="true" />}
            onClick={() => void load(0)}
          />
        }
      />
    );
  else if (!items.length)
    body = (
      <StateNotice
        kind="empty"
        title={q || route.kind ? "No matching entities" : "No entities yet"}
      />
    );
  else
    body = (
      <VStack gap={3}>
        <DataTable
          rows={items as Row[]}
          rowKey="id"
          label="Entities"
          noun={["entity", "entities"]}
          footer={false}
          columns={columns}
        />
        {next !== null && (
          <HStack>
            <Button
              label="Load more"
              size="sm"
              variant="secondary"
              isLoading={busy}
              onClick={() => void load(next)}
            />
          </HStack>
        )}
      </VStack>
    );
  return (
    <VStack gap={4} className="knowledge-list">
      <div className="data-toolbar">
        <FilterBar
          search={{
            label: "Search knowledge",
            value: q,
            onChange: (value) => setQ(value.slice(0, 2048)),
            isBusy: busy,
          }}
        />
        <KindChips route={route} navigate={navigate} />
      </div>
      {body}
    </VStack>
  );
}

const EVENT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: ADMIN_TIME_ZONE,
});
const EVENT_DATE_UTC = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** A timeline entry's day. A calendar date reads as itself everywhere; a
 * moment reads on the Eastern calendar, as every admin time does, the same
 * on the server and in the browser. */
function EventDate({ at }: { at: string }) {
  const ms = Date.parse(at);
  const dateOnly = at.length === 10;
  return (
    <time dateTime={at} className="workspace-time">
      {(dateOnly ? EVENT_DATE_UTC : EVENT_DATE).format(ms)}
    </time>
  );
}

/** A record an entity points to, by the title the entity gives it. */
function RecordLink({ id, title }: { id: string; title: string }) {
  return (
    <a href={dataRecordHref(id)} className="knowledge-record-link">
      {title}
    </a>
  );
}

function EntityBody({ entity }: { entity: Entity }) {
  // A backlink carries only a record id; the entity's own facts and
  // timeline name most of them.
  const titles = useMemo(() => {
    const known = new Map<string, string>();
    for (const event of entity.timeline)
      if (event.recordId) known.set(event.recordId, event.title);
    for (const fact of entity.facts)
      if (fact.recordId && !known.has(fact.recordId))
        known.set(fact.recordId, fact.label);
    return known;
  }, [entity]);
  return (
    <VStack gap={6} className="knowledge-entity">
      {entity.summary && (
        <Text as="p" className="knowledge-summary">
          {entity.summary}
        </Text>
      )}
      {entity.facts.length > 0 && (
        <section aria-labelledby="knowledge-facts" className="knowledge-part">
          <Heading level={3} id="knowledge-facts">
            Facts
          </Heading>
          <DefinitionList
            items={entity.facts.map((fact) => [
              fact.label,
              fact.recordId ? (
                <RecordLink id={fact.recordId} title={fact.value} />
              ) : (
                fact.value
              ),
            ])}
          />
        </section>
      )}
      {entity.timeline.length > 0 && (
        <section
          aria-labelledby="knowledge-timeline"
          className="knowledge-part"
        >
          <Heading level={3} id="knowledge-timeline">
            Timeline
          </Heading>
          <ol className="knowledge-timeline">
            {entity.timeline.map((event, index) => {
              return (
                <li key={`${event.at}:${index}`}>
                  <EventDate at={event.at} />
                  {event.recordId ? (
                    <RecordLink id={event.recordId} title={event.title} />
                  ) : (
                    <span>{event.title}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}
      {entity.backlinks.length > 0 && (
        <section
          aria-labelledby="knowledge-backlinks"
          className="knowledge-part"
        >
          <Heading level={3} id="knowledge-backlinks">
            Records
          </Heading>
          <ul className="knowledge-backlinks">
            {entity.backlinks.map((id) => (
              <li key={id}>
                <RecordLink id={id} title={titles.get(id) ?? "Record"} />
                {!titles.has(id) && (
                  <code className="knowledge-record-id" title={id}>
                    {id.slice(4, 16)}
                  </code>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </VStack>
  );
}

function EntityPanel({
  reader,
  id,
  route,
  navigate,
}: {
  reader: KnowledgeReader;
  id: string;
  route: KnowledgeRoute;
  navigate: DataNavigate;
}) {
  const split = useSplitView();
  const [entity, setEntity] = useState<Entity | null | undefined>(undefined);
  const [failure, setFailure] = useState<Failure | null>(null);
  useEffect(() => {
    let current = true;
    setEntity(undefined);
    setFailure(null);
    reader.get(id).then(
      (found) => current && setEntity(found),
      (error: unknown) => current && setFailure(failureOf(error)),
    );
    return () => {
      current = false;
    };
  }, [reader, id]);
  const close = (
    <Button
      label={split ? "Close entity" : "Back to knowledge"}
      tooltip={split ? "Close entity" : "Back to knowledge"}
      isIconOnly
      size="sm"
      variant="ghost"
      icon={
        split ? (
          <XIcon weight="regular" aria-hidden="true" />
        ) : (
          <ArrowBendUpLeftIcon weight="regular" aria-hidden="true" />
        )
      }
      onClick={() => navigate(knowledgeHref(route.kind))}
    />
  );
  const title = entity ? entity.name : "Entity";
  const [Glyph] = kindGlyph(entity?.kind);
  return (
    <SplitPanel
      className="knowledge-panel"
      aria-label={`${title} details`}
      header={
        <HStack gap={3} vAlign="center" className="knowledge-panel-header">
          {!split && close}
          {entity && (
            <span
              className="workspace-row-mark knowledge-mark"
              title={kindName(entity.kind)}
            >
              <Glyph weight="regular" aria-hidden="true" />
              <span className="sr-only">{kindName(entity.kind)}</span>
            </span>
          )}
          <Heading level={split ? 2 : 1} className="knowledge-title">
            {title}
          </Heading>
          {split ? close : <EasternClock />}
        </HStack>
      }
    >
      {failure ? (
        <StateNotice kind="error" title={failure.title} />
      ) : entity === undefined ? (
        <LoadingSkeleton label="entity" rows={3} columns={2} />
      ) : entity === null ? (
        <StateNotice kind="empty" title="Entity not found" />
      ) : (
        <EntityBody entity={entity} />
      )}
    </SplitPanel>
  );
}

function Page({
  count,
  badge,
  actions,
  children,
}: {
  count?: number;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <WorkspacePage
      title="Knowledge"
      count={count}
      badge={badge}
      actions={actions}
    >
      {children}
    </WorkspacePage>
  );
}

function KnowledgeWorkspace({
  reader,
  route,
  navigate,
  badge,
  actions,
}: {
  reader: KnowledgeReader;
  route: KnowledgeRoute;
  navigate: DataNavigate;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const [count, setCount] = useState<number | undefined>(undefined);
  return (
    <div
      className="data-workspace knowledge-view"
      data-view="knowledge"
      data-entity-open={route.id ? "true" : "false"}
    >
      {/* The page's title line spans the list and the open entity, so its
          clock ends the line at the page's edge, as on Records. */}
      <Page count={count} badge={badge} actions={actions}>
        <SplitView
          list={
            <EntityList
              reader={reader}
              route={route}
              navigate={navigate}
              onCount={setCount}
            />
          }
          panel={
            route.id ? (
              <EntityPanel
                key={route.id}
                reader={reader}
                id={route.id}
                route={route}
                navigate={navigate}
              />
            ) : null
          }
        />
      </Page>
    </div>
  );
}

/** Production: entities through the Data session, once System serves them. */
function LiveKnowledge({
  route,
  navigate,
  session: injected,
  fetch: fetcher,
}: {
  route: KnowledgeRoute;
  navigate: DataNavigate;
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
}) {
  const [base] = useState<PrivateReaderSession | null>(
    () =>
      injected ??
      (typeof window === "undefined" ? null : sharedPrivateSession()),
  );
  const session = useDataSession({
    enabled: true,
    session: base ?? undefined,
    fetch: fetcher,
  });
  const ready = session.status === "ready" && base !== null;
  const reader = useMemo(
    () =>
      ready && base
        ? createPrivateKnowledgeReader(base, { fetch: fetcher })
        : null,
    // A new session is a new reader, so nothing read by the last one stays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, base, fetcher, session.generation],
  );
  const actions = <DataSessionControl session={session} />;
  if (!reader)
    return (
      <div className="data-workspace knowledge-view" data-view="knowledge">
        <Page actions={actions}>
          <SessionNotice session={session} label="knowledge" />
        </Page>
      </div>
    );
  return (
    <KnowledgeWorkspace
      key={session.generation}
      reader={reader}
      route={route}
      navigate={navigate}
      actions={actions}
    />
  );
}

export function KnowledgeView({
  route,
  navigate,
  enabled,
  fixture,
  session,
  fetch: fetcher,
}: {
  route: KnowledgeRoute;
  navigate: DataNavigate;
  /** PRIVATE_READER_ENABLED and PRIVATE_READER_KNOWLEDGE_ENABLED are both
   * exactly "true" on the server. */
  enabled: boolean;
  /** Development only: a synthetic wiki in the target contract's shape. */
  fixture?: KnowledgeFixture;
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
}) {
  const fixtureReader = useMemo(
    () => (fixture ? createFixtureKnowledgeReader(fixture) : null),
    [fixture],
  );
  if (fixtureReader)
    return (
      <KnowledgeWorkspace
        reader={fixtureReader}
        route={route}
        navigate={navigate}
        badge={<SampleBadge />}
      />
    );
  if (!enabled)
    return (
      <div className="data-workspace knowledge-view" data-view="knowledge">
        <Page>
          <StateNotice kind="empty" icon={BrainIcon} title="Not built yet" />
        </Page>
      </div>
    );
  return (
    <LiveKnowledge
      route={route}
      navigate={navigate}
      session={session}
      fetch={fetcher}
    />
  );
}
