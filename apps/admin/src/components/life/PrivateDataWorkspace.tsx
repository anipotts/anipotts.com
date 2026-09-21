import React, { useEffect, useId, useRef, useState } from "react";
import { Layout, LayoutContent, LayoutHeader } from "@astryxdesign/core/Layout";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { List, ListItem } from "@astryxdesign/core/List";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Toolbar } from "@astryxdesign/core/Toolbar";
import { Token } from "@astryxdesign/core/Token";
import {
  ClockCounterClockwiseIcon,
  FileTextIcon,
  LockKeyIcon,
  ShieldWarningIcon,
  SignOutIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import "./life-workspace.css";
import { LifeReadView, LifeRecord } from "./LifeWorkspace";
import { AdminSkeleton } from "../astryx/AdminFeedback";
import { nextLifeOffset, type LifeResult } from "../../data/personal-context";
import {
  LifeReadSession,
  appendLifeBody,
  type LifeReader,
} from "../../lib/life-read-session";
import {
  createPrivateReaderSession,
  type PrivateReaderClearReason,
  type PrivateReaderSession,
} from "../../lib/private-reader-client";
import { usePrivateReader } from "../../lib/private-reader-fetch";

/** Reads the existing same-origin editorial CSRF token for issuance. */
async function readEditorialCsrf(): Promise<string> {
  const response = await fetch("/api/editorial/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("CSRF unavailable");
  const body = (await response.json()) as { csrf?: unknown };
  if (typeof body.csrf !== "string") throw new Error("CSRF unavailable");
  return body.csrf;
}

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown, fallback: string) =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;

/** Preserved revisions for one record, newest first as the reader returns them. */
export function PrivateRecordHistory({
  record,
}: {
  record: Record<string, unknown>;
}) {
  const revisions = Array.isArray(record.revisions)
    ? record.revisions.map(object).filter((item) => item.revision_id)
    : [];
  const origins = Array.isArray(record.origins) ? record.origins : [];
  // The reader caps revisions and origins at history_limit (100) with no paging.
  const limit =
    typeof record.history_limit === "number" && record.history_limit > 0
      ? record.history_limit
      : null;
  return (
    <VStack gap={3} as="section" aria-label="Revision history">
      <Heading level={3}>History</Heading>
      {revisions.length === 0 ? (
        <Text color="secondary">No preserved revisions were returned.</Text>
      ) : (
        <List density="compact" className="life-summary-list">
          {revisions.map((revision) => {
            const id = text(revision.revision_id, "Unknown revision");
            return (
              <ListItem
                key={id}
                label={<Text wordBreak="break-word">{id}</Text>}
                startContent={
                  <ClockCounterClockwiseIcon
                    weight="regular"
                    size="var(--spacing-5)"
                    aria-hidden="true"
                  />
                }
                description={
                  <VStack gap={1}>
                    <Text type="supporting" color="secondary">
                      Observed{" "}
                      {text(revision.observed_at, "at an unknown time")}
                    </Text>
                    <Text type="supporting" color="secondary">
                      Source version {text(revision.source_version, "unknown")}
                      {revision.source_modified_at
                        ? `, modified ${text(revision.source_modified_at, "")}`
                        : ""}
                    </Text>
                  </VStack>
                }
                endContent={
                  id === record.revision_id ? (
                    <Token size="sm" label="Current" />
                  ) : undefined
                }
              />
            );
          })}
        </List>
      )}
      {limit !== null && revisions.length >= limit && (
        <Text type="supporting" color="secondary">
          Showing the latest {limit} revisions. Older revisions are preserved
          but not returned.
        </Text>
      )}
      {limit !== null && origins.length >= limit && (
        <Text type="supporting" color="secondary">
          Showing the latest {limit} origins.
        </Text>
      )}
    </VStack>
  );
}

const cleared: Record<
  PrivateReaderClearReason,
  {
    title: string;
    description: string;
    status: "info" | "warning";
    Icon: typeof LockKeyIcon;
  }
> = {
  expired: {
    title: "Private access expired",
    description:
      "Records were cleared from this page. Open the reader again to continue.",
    status: "warning",
    Icon: LockKeyIcon,
  },
  denied: {
    title: "Private access was refused",
    description:
      "Records were cleared from this page. Sign in to admin again if this continues.",
    status: "warning",
    Icon: ShieldWarningIcon,
  },
  unavailable: {
    title: "The private reader is unavailable",
    description:
      "No credential could be issued. This does not mean your records are empty.",
    status: "warning",
    Icon: WarningCircleIcon,
  },
  logout: {
    title: "Private session ended",
    description: "Records were cleared from this page.",
    status: "info",
    Icon: SignOutIcon,
  },
};

/** Search, record view and history for one live private reader. */
export function PrivateDataExplorer({ reader }: { reader: LifeReader }) {
  const detailId = useId();
  const [status, setStatus] = useState<LifeResult | null>(null);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [offsets, setOffsets] = useState([0]);
  const [result, setResult] = useState<LifeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const statusSession = useRef(new LifeReadSession());
  const listSession = useRef(new LifeReadSession());
  const detailSession = useRef(new LifeReadSession());
  const detailRegion = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const restoreFocus = useRef(false);

  useEffect(() => {
    void statusSession.current
      .run(reader, { method: "status" })
      .then((next) => next && setStatus(next));
    // An empty query returns the most recent records in timeline order.
    void search("", [0]);
    const sessions = [statusSession, listSession, detailSession];
    return () => sessions.forEach((session) => session.current.invalidate());
  }, [reader]);
  useEffect(() => {
    if (selectedId) detailRegion.current?.focus();
    else if (restoreFocus.current) {
      trigger.current?.focus();
      restoreFocus.current = false;
    }
  }, [selectedId]);

  const closeRecord = (restore = false) => {
    restoreFocus.current = restore;
    detailSession.current.invalidate();
    setSelectedId(null);
    setRecord(null);
    setDetailBusy(false);
    setDetailError(null);
  };
  async function search(q: string, history: number[]) {
    closeRecord();
    setBusy(true);
    const next = await listSession.current.run(reader, {
      method: "search",
      q,
      offset: history.at(-1) ?? 0,
    });
    if (!next) return;
    setBusy(false);
    setResult(next);
    if (next.state === "ready") {
      setSubmitted(q);
      setOffsets(history);
    }
  }
  async function select(id: string, button: HTMLButtonElement) {
    trigger.current = button;
    setSelectedId(id);
    setRecord(null);
    setDetailBusy(true);
    setDetailError(null);
    const next = await detailSession.current.run(reader, { method: "get", id });
    if (!next) return;
    setDetailBusy(false);
    if (next.state === "ready") setRecord(next.data);
    else
      setDetailError(
        next.state === "not_found"
          ? "This record was not found in the authorized source."
          : "This record could not be read. Try selecting it again.",
      );
  }
  async function moreBody() {
    if (
      !record ||
      typeof record.record_id !== "string" ||
      typeof record.next_body_offset !== "number"
    )
      return;
    const current = record;
    setDetailBusy(true);
    setDetailError(null);
    const next = await detailSession.current.run(reader, {
      method: "get",
      id: record.record_id,
      body_offset: record.next_body_offset,
    });
    if (!next) return;
    setDetailBusy(false);
    if (next.state !== "ready") {
      setDetailError("The next section could not be read. Try again.");
      return;
    }
    try {
      setRecord(appendLifeBody(current, next.data));
    } catch (error) {
      setDetailError(
        error instanceof Error ? error.message : "Reload this record.",
      );
    }
  }

  let nextOffset: number | null = null;
  if (result?.state === "ready") {
    try {
      nextOffset = nextLifeOffset(result.data.next_offset, offsets.at(-1) ?? 0);
    } catch {
      nextOffset = null;
    }
  }
  return (
    <div
      className={`life-explorer${selectedId ? " life-explorer-detail-open" : ""}`}
    >
      <VStack gap={5} className="life-master-region">
        {status ? (
          <LifeReadView section="overview" result={status} />
        ) : (
          <AdminSkeleton kind="record" />
        )}
        <HStack
          as="form"
          gap={2}
          wrap="wrap"
          vAlign="end"
          className="life-search-toolbar"
          onSubmit={(event: React.FormEvent) => {
            event.preventDefault();
            void search(query, [0]);
          }}
        >
          <TextInput
            label="Search records"
            value={query}
            onChange={(value) => setQuery(value.slice(0, 2048))}
          />
          <Button type="submit" label="Search" isLoading={busy} />
        </HStack>
        {busy && !result ? (
          <AdminSkeleton kind="records" />
        ) : (
          result && (
            <VStack gap={2} aria-busy={busy}>
              {result.state === "ready" && (
                <Heading level={2}>
                  {submitted ? "Search results" : "Recent records"}
                </Heading>
              )}
              <LifeReadView
                section="people"
                glyph={FileTextIcon}
                result={result}
                onSelect={(id, button) => void select(id, button)}
                selectedId={selectedId}
                detailId={detailId}
              />
            </VStack>
          )
        )}
        {!busy &&
          result?.state === "ready" &&
          (offsets.length > 1 || nextOffset !== null) && (
            <Toolbar
              label="Record pages"
              startContent={
                <Button
                  label="Previous"
                  isDisabled={offsets.length < 2}
                  clickAction={() => search(submitted, offsets.slice(0, -1))}
                />
              }
              endContent={
                <Button
                  label="Next"
                  isDisabled={nextOffset === null}
                  clickAction={() =>
                    nextOffset === null
                      ? Promise.resolve()
                      : search(submitted, [...offsets, nextOffset])
                  }
                />
              }
            />
          )}
      </VStack>
      {selectedId && (
        <section
          id={detailId}
          ref={detailRegion}
          tabIndex={-1}
          aria-label="Record details"
          className="life-details-region"
        >
          <VStack gap={5}>
            <Button
              className="life-record-back"
              label="Back to results"
              variant="ghost"
              onClick={() => closeRecord(true)}
            />
            {detailError && <Text role="alert">{detailError}</Text>}
            {detailBusy && !record && <AdminSkeleton kind="record" />}
            {record && <LifeRecord record={record} />}
            {record?.next_body_offset != null && (
              <Button
                label="Read more"
                clickAction={moreBody}
                isLoading={detailBusy}
              />
            )}
            {record && <PrivateRecordHistory record={record} />}
          </VStack>
        </section>
      )}
    </div>
  );
}

/**
 * Data workspace backed by the private reader on ap-mini. Rendered only when
 * PRIVATE_READER_ENABLED is exactly "true"; otherwise the existing Life
 * workspace renders unchanged. Private state lives in this component's memory
 * and is dropped on logout, page hide, denial or credential expiry.
 */
export function PrivateDataWorkspace({
  session: injected,
  fetch: fetcher,
}: {
  session?: PrivateReaderSession;
  fetch?: typeof fetch;
}) {
  const [session] = useState(
    () =>
      injected ??
      createPrivateReaderSession({
        fetch: (...args) => globalThis.fetch(...args),
        csrf: readEditorialCsrf,
      }),
  );
  useEffect(() => {
    // bfcache would otherwise keep private records in a restored page.
    const end = () => session.logout();
    window.addEventListener("pagehide", end);
    return () => {
      window.removeEventListener("pagehide", end);
      session.logout();
    };
  }, [session]);
  const { state, reader } = usePrivateReader(session, { fetch: fetcher });
  // Each new reader is a new private session: remount so nothing carries over.
  const generation = useRef<{ reader: LifeReader | null; key: number }>({
    reader: null,
    key: 0,
  });
  if (reader && generation.current.reader !== reader)
    generation.current = { reader, key: generation.current.key + 1 };
  const [opening, setOpening] = useState(false);
  const open = async () => {
    setOpening(true);
    try {
      await session.start();
    } finally {
      setOpening(false);
    }
  };

  let body: React.ReactNode;
  if (state.status === "ready" && reader)
    body = <PrivateDataExplorer key={generation.current.key} reader={reader} />;
  else if (state.status === "cleared") {
    const view = cleared[state.reason];
    body = (
      <Banner
        status={view.status}
        container="section"
        title={view.title}
        description={view.description}
        icon={<view.Icon weight="regular" />}
        endContent={
          <Button label="Open again" clickAction={open} isLoading={opening} />
        }
      />
    );
  } else
    body = (
      <EmptyState
        headingLevel={2}
        title="Open the private reader"
        description="Records are read from ap-mini with a credential that lasts at most a minute and renews while this page is open. Nothing is stored in this browser."
        icon={<LockKeyIcon weight="regular" />}
        actions={
          <Button label="Open reader" clickAction={open} isLoading={opening} />
        }
      />
    );

  return (
    <Layout
      height="auto"
      className="life-workspace"
      padding={0}
      header={
        <LayoutHeader className="life-page-header">
          <HStack
            gap={3}
            vAlign="center"
            wrap="wrap"
            className="life-page-title"
          >
            <Heading level={1}>Data</Heading>
            {state.status === "ready" ? (
              <Button
                label="End private session"
                variant="secondary"
                icon={<SignOutIcon weight="regular" aria-hidden="true" />}
                onClick={() => session.logout()}
              />
            ) : (
              <Token size="sm" label="Read only" />
            )}
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent className="life-page-content">{body}</LayoutContent>
      }
    />
  );
}
