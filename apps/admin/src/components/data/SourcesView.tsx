import React, { useEffect, useRef, useState } from "react";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { RowsIcon, StackSimpleIcon } from "@phosphor-icons/react";
import { nextLifeOffset, type LifeResult } from "../../data/personal-context";
import { LifeReadSession, type LifeReader } from "../../lib/life-read-session";
import { dataRecordsHref, dataSource } from "../../lib/data-routes";
import type { CardSet, CardsView, DataCard } from "../../lib/data-extras";
import { BrandTile } from "../BrandTile";
import {
  DataTable,
  InlineNotice,
  LoadingSkeleton,
  RelativeTime,
  RowTitle,
  StateBadge,
  StateNotice,
} from "../workspace/Workspace";
import {
  kindGlyph,
  parseItems,
  parseSource,
  sourceLabel,
  type DataSourceRow,
} from "./data-model";
import { ReadNotice } from "./DataNotices";
import { SourceName } from "./RecordsView";

type Failure = Exclude<LifeResult, { state: "ready" }>;

/** A source's counts as glyph and number pairs, named in full for
 * assistive technology. */
function SourceFigures({ source }: { source: DataSourceRow }) {
  const name = `${source.records} ${source.records === 1 ? "record" : "records"}, ${source.revisions} ${source.revisions === 1 ? "revision" : "revisions"}`;
  return (
    <span className="data-figures" aria-label={name} title={name}>
      <span>
        <RowsIcon weight="regular" aria-hidden="true" />
        {source.records}
      </span>
      <span>
        <StackSimpleIcon weight="regular" aria-hidden="true" />
        {source.revisions}
      </span>
    </span>
  );
}

/** Sources, each opening Records filtered to it. */
export function SourcesExplorer({
  reader,
  onCount,
}: {
  reader: LifeReader;
  onCount?: (count: number | undefined) => void;
}) {
  const [items, setItems] = useState<DataSourceRow[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);
  const session = useRef(new LifeReadSession());
  async function read(offset: number) {
    setBusy(true);
    const result = await session.current.run(reader, {
      method: "sources",
      offset,
    });
    if (!result) return;
    setBusy(false);
    if (result.state !== "ready") {
      setFailure(result);
      if (offset === 0) setItems([]);
      return;
    }
    setFailure(null);
    const page = parseItems(result.data, parseSource);
    setItems((previous) =>
      offset === 0 ? page : [...(previous ?? []), ...page],
    );
    setTotal(
      typeof result.data.total === "number" ? result.data.total : undefined,
    );
    try {
      setNext(nextLifeOffset(result.data.next_offset, offset));
    } catch {
      setNext(null);
    }
  }
  useEffect(() => {
    void read(0);
    const current = session.current;
    return () => current.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader]);
  useEffect(
    () => onCount?.(failure ? undefined : total),
    [total, failure, onCount],
  );
  if (!items) return <LoadingSkeleton label="sources" columns={3} />;
  if (failure && !items.length)
    return <ReadNotice result={failure} onRetry={() => void read(0)} />;
  if (!items.length) return <StateNotice kind="empty" title="No sources yet" />;
  return (
    <VStack gap={3} aria-busy={busy}>
      <DataTable
        rows={items}
        rowKey="id"
        label="Sources"
        noun={["source", "sources"]}
        footer={false}
        columns={[
          {
            key: "source",
            header: "Source",
            render: (source) => {
              const label = sourceLabel(source.id);
              return (
                <RowTitle
                  mark={<BrandTile id={label.tile.id} kind={label.tile.kind} />}
                  kind="Source"
                  title={label.name}
                  tooltip={source.id}
                  linkLabel={`${label.name} records`}
                  href={
                    dataSource(source.id)
                      ? dataRecordsHref({ source: source.id })
                      : undefined
                  }
                  secondary={<SourceFigures source={source} />}
                  time={source.lastObservedAt}
                />
              );
            },
          },
          {
            key: "first",
            header: "First seen",
            width: 120,
            hideBelow: "large",
            render: (source) => (
              <RelativeTime value={source.firstObservedAt} format="date" />
            ),
          },
          {
            key: "last",
            header: "Last seen",
            width: 96,
            render: (source) => <RelativeTime value={source.lastObservedAt} />,
          },
        ]}
      />
      {failure && (
        <InlineNotice tone="warning" title="More sources unreadable" />
      )}
      {next !== null && (
        <HStack>
          <Button
            label="Load more"
            size="sm"
            variant="secondary"
            isLoading={busy}
            onClick={() => void read(next)}
          />
        </HStack>
      )}
    </VStack>
  );
}

const CARDS: Record<
  CardsView,
  { unavailable: string; empty: string; label: string }
> = {
  health: {
    unavailable: "Health unavailable",
    empty: "No health summaries",
    label: "Health summaries",
  },
  knowledge: {
    unavailable: "Knowledge unavailable",
    empty: "No knowledge cards",
    label: "Knowledge cards",
  },
};

/** Health summaries or Knowledge cards, read on the server. A card opens
 * nothing. Line 2 is its source tile and a two-line summary; a non-default
 * freshness joins it on phones. */
export function CardsExplorer({
  view,
  set,
  onCount,
}: {
  view: CardsView;
  set: CardSet | undefined;
  onCount?: (count: number | undefined) => void;
}) {
  const copy = CARDS[view];
  const available = Boolean(set?.available);
  const cards = set?.cards ?? [];
  useEffect(
    () => onCount?.(available ? cards.length : undefined),
    [available, cards.length, onCount],
  );
  if (!available) return <StateNotice kind="error" title={copy.unavailable} />;
  if (!cards.length) return <StateNotice kind="empty" title={copy.empty} />;
  return (
    <div className="data-cards">
      <DataTable
        rows={cards as Array<DataCard & Record<string, unknown>>}
        rowKey="id"
        label={copy.label}
        noun={["card", "cards"]}
        footer={false}
        interactive={false}
        columns={[
          {
            key: "title",
            header: "Title",
            render: (card) => {
              const [glyph, name] = kindGlyph(
                view === "health" ? "health" : card.kind,
              );
              return (
                <RowTitle
                  icon={glyph}
                  kind={name}
                  title={card.title}
                  secondary={
                    <SourceName id={card.source} text={card.summary || null} />
                  }
                  mobile={
                    <StateBadge domain="freshness" state={card.freshness} />
                  }
                  time={card.observed_at}
                />
              );
            },
          },
          {
            key: "freshness",
            header: "Freshness",
            width: 112,
            render: (card) => (
              <StateBadge domain="freshness" state={card.freshness} />
            ),
          },
          {
            key: "observed",
            header: "Observed",
            // Holds "Not recorded" with the cell inset.
            width: 120,
            render: (card) => <RelativeTime value={card.observed_at} />,
          },
        ]}
      />
    </div>
  );
}
