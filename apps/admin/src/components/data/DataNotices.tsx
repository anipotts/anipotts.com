import React from "react";
import { Button } from "@astryxdesign/core/Button";
import {
  ArrowClockwiseIcon,
  LockKeyIcon,
  LockKeyOpenIcon,
  LockSimpleIcon,
  PlugsIcon,
  ShieldWarningIcon,
  type Icon,
} from "@phosphor-icons/react";
import type { DataResult } from "../../data/personal-context";
import { READER_HOP_TITLES } from "../../lib/reader-reach";
import { LoadingSkeleton, StateNotice } from "../workspace/Workspace";
import type { DataSession } from "./useDataSession";

/** Moves between Data routes: a push for a new place, a replace for a
 * filter. The shell that owns the route draws the result. */
export type DataNavigate = (
  href: string,
  options?: { replace?: boolean },
) => void;

type Notice = {
  kind: "not-connected" | "error";
  icon: Icon;
  title: string;
  action: string;
  actionIcon: Icon;
};

/** Two kinds of closed session: one the owner or the clock closed, which
 * opens again, and one the reader refused, which can be retried. */
const CLOSED: Record<NonNullable<DataSession["reason"]>, Notice> = {
  idle: {
    kind: "not-connected",
    icon: LockKeyIcon,
    title: "Session locked",
    action: "Unlock",
    actionIcon: LockKeyOpenIcon,
  },
  logout: {
    kind: "not-connected",
    icon: LockKeyIcon,
    title: "Session locked",
    action: "Unlock",
    actionIcon: LockKeyOpenIcon,
  },
  expired: {
    kind: "not-connected",
    icon: LockKeyIcon,
    title: "Session expired",
    action: "Unlock",
    actionIcon: LockKeyOpenIcon,
  },
  denied: {
    kind: "error",
    icon: ShieldWarningIcon,
    title: "Access refused",
    action: "Try again",
    actionIcon: ArrowClockwiseIcon,
  },
  // Admin's own credential route failed: ap-mini was never asked (A-26).
  unavailable: {
    kind: "error",
    icon: PlugsIcon,
    title: READER_HOP_TITLES.unissued,
    action: "Try again",
    actionIcon: ArrowClockwiseIcon,
  },
};

/** The session when it is not ready: off, opening, or closed. A reopen keeps
 * the notice in place with its button working. */
export function SessionNotice({
  session,
  label,
}: {
  session: DataSession;
  /** What is loading, such as "records" or "sources". */
  label: string;
}) {
  if (session.status === "ready") return null;
  if (session.status === "off")
    return (
      <StateNotice kind="not-connected" icon={PlugsIcon} title="Reader off" />
    );
  if (session.status === "opening")
    return <LoadingSkeleton label={label} columns={4} />;
  const notice = CLOSED[session.reason ?? "logout"];
  const Glyph = notice.actionIcon;
  return (
    <StateNotice
      kind={notice.kind}
      icon={notice.icon}
      title={notice.title}
      action={
        <Button
          label={notice.action}
          size="sm"
          variant="secondary"
          isLoading={session.busy}
          icon={<Glyph weight="regular" aria-hidden="true" />}
          onClick={() => void session.open()}
        />
      }
    />
  );
}

/** Locks an open session. The slot keeps its size in every state, so the
 * header never moves as the session opens and closes. */
export function DataSessionControl({ session }: { session: DataSession }) {
  return (
    <span className="data-session-slot">
      {session.status === "ready" && (
        <Button
          label="Lock session"
          tooltip="Lock session"
          isIconOnly
          size="sm"
          variant="ghost"
          icon={<LockSimpleIcon weight="regular" aria-hidden="true" />}
          onClick={session.end}
        />
      )}
    </span>
  );
}

/** A failed read's title: fixed copy that never repeats reader text. An
 * unavailable read names the hop that failed (lib/reader-reach.ts); only a
 * request that went out and got no reply says ap-mini is unreachable. */
export function readNoticeTitle(
  result: Exclude<DataResult, { state: "ready" }>,
): string {
  if (result.state === "unavailable")
    return READER_HOP_TITLES[result.hop ?? "reader"];
  return {
    disconnected: "Reader off",
    denied: "Access refused",
    not_found: "Record not found",
    invalid: "Unreadable response",
  }[result.state];
}

/** Results a second try cannot change: the reader is off, or it answered
 * that the record is not there (withdrawn, excluded or never held). */
const FINAL = new Set<DataResult["state"]>(["disconnected", "not_found"]);

/** A failed read. Try again is offered only where another try could get a
 * different answer (A-25). */
export function ReadNotice({
  result,
  onRetry,
}: {
  result: Exclude<DataResult, { state: "ready" }>;
  onRetry?: () => void;
}) {
  return (
    <StateNotice
      kind={result.state === "disconnected" ? "not-connected" : "error"}
      icon={result.state === "disconnected" ? PlugsIcon : undefined}
      title={readNoticeTitle(result)}
      action={
        onRetry && !FINAL.has(result.state) ? (
          <Button
            label="Try again"
            size="sm"
            variant="secondary"
            icon={<ArrowClockwiseIcon weight="regular" aria-hidden="true" />}
            onClick={onRetry}
          />
        ) : undefined
      }
    />
  );
}
