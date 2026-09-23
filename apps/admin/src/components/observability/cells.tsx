import React, { useSyncExternalStore } from "react";
import { Button } from "@astryxdesign/core/Button";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import {
  CalendarDotsIcon,
  DatabaseIcon,
  EyeIcon,
  FileTextIcon,
  GaugeIcon,
  GlobeSimpleIcon,
  HandTapIcon,
  HandshakeIcon,
  HeartbeatIcon,
  LightningIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  ProhibitIcon,
  PulseIcon,
  RepeatIcon,
  SealQuestionIcon,
  StackIcon,
  WarningCircleIcon,
  WarningOctagonIcon,
  type Icon,
} from "@phosphor-icons/react";
import {
  opsFreshness,
  opsRunbookHref,
  type OpsCatalogEntry,
  type OpsServiceView,
  type OpsState,
  type OpsTrigger,
} from "../../lib/ops-v1";
import { opsNextRun, opsTriggerFacts, opsUnverified } from "../../lib/ops-view";
import {
  deviceName,
  hostDevice,
  opsNaming,
  type Naming,
} from "../../lib/naming";
import { deviceMark, linkMark, markLabel } from "../../lib/marks";
import { useLiveText } from "../../lib/live-clock";
import { sentenceCase } from "../../lib/sentence-case";
import { BrandTile, type BrandTileSize } from "../BrandTile";
import {
  CELL_WIDTHS,
  DueTime,
  RelativeTime,
  StateBadge,
  StateCell,
  badgeFor,
} from "../workspace/Workspace";
import { clockText, durationText, secondsText } from "../workspace/format";

/**
 * Observability's cells: tiles and names from lib/naming.ts, the trigger
 * glyph, the budget-aware last success, the approximate next run, a run's
 * result, an HTTP status and the clock and duration texts. Every one sits in
 * a kit column (components/workspace) at its CELL_WIDTHS width.
 */

/**
 * Observability's column widths, cell inset included, sized to what its
 * cells hold rather than to the kit's widest (CELL_WIDTHS), so the room goes
 * to names: a state chip, a 20px tile, a figure such as "1m 24s" or "8,612",
 * an incident's age, which is always a relative one ("23h ago"), and a last
 * success beside an open panel, whose "Not recorded" is for assistive
 * technology only.
 */
export const OPS_WIDTHS = {
  /** A state chip, "Unverified" (86px) at the widest. */
  state: 112,
  /** A chip or a past state such as "was degraded" (91px), for incidents. */
  incident: 116,
  tile: 44,
  /** A 20px tile as the last column, whose end inset is 16px. */
  lastTile: 48,
  figure: 72,
  age: 88,
  /** "Last success" as the last column beside an open panel (82px). */
  lastTime: 112,
  time: CELL_WIDTHS.time,
} as const;

type Entry = Pick<OpsCatalogEntry, "id" | "name"> & {
  kind?: string | null;
  host?: string | null;
};

/** An entry's short name, tile, device and tooltip. With the catalog's
 * `names` (opsDistinctNames), a name two entries share carries its host. */
export function entryNaming(
  entry: Entry,
  names?: ReadonlyMap<string, string>,
): Naming {
  const naming = opsNaming(entry);
  const name = names?.get(entry.id);
  return name ? { ...naming, name } : naming;
}

/** The host an entry's shown name ends with when two entries share its
 * name (opsDistinctNames), which a title keeps whole; otherwise undefined. */
export function entryKeep(
  entry: Entry,
  names?: ReadonlyMap<string, string>,
): string | undefined {
  const name = names?.get(entry.id);
  const keep = `, ${deviceName(entry.host)}`;
  return name?.endsWith(keep) ? keep : undefined;
}

/** What an entry's tile stands for, for its tooltip. */
export function entryKind(entry: Entry, naming = entryNaming(entry)) {
  return markLabel(naming.tile) ?? sentenceCase(entry.kind || "entry");
}

/** A row's lead tile: the entry's brand, device or kind glyph. */
export function EntryTile({
  naming,
  size,
}: {
  naming: Naming;
  size?: BrandTileSize;
}) {
  return <BrandTile id={naming.tile.id} kind={naming.tile.kind} size={size} />;
}

/** A device tile, named by its tooltip, or nothing when no device
 * resolves. */
export function DeviceTile({
  device,
  size = 20,
}: {
  device: string | null | undefined;
  size?: BrandTileSize;
}) {
  if (!device) return null;
  const tile = hostDevice(device) ?? deviceMark(device);
  return (
    <BrandTile
      id={tile.id}
      kind={tile.kind}
      size={size}
      label={deviceName(device)}
    />
  );
}

/** A runbook's destination, and how its tooltip and link name it. */
export function runbookLink(path: string) {
  const href = opsRunbookHref(path);
  const mark = linkMark(href);
  const onGitHub = mark.id === "github";
  return {
    href,
    mark,
    where: onGitHub ? "Runbook on GitHub" : "Runbook",
  };
}

/** The runbook as an action: the provider's tile, never an external-link
 * square. Icon-only in a row, labelled in a panel. */
export function RunbookButton({
  path,
  iconOnly = false,
  name,
}: {
  path: string;
  iconOnly?: boolean;
  /** Whose runbook, for an icon-only button's accessible name. */
  name?: string;
}) {
  const link = runbookLink(path);
  return (
    <Button
      label={iconOnly && name ? `${link.where}, ${name}` : link.where}
      tooltip={link.where}
      isIconOnly={iconOnly}
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      size="sm"
      variant={iconOnly ? "ghost" : "secondary"}
      icon={<BrandTile id={link.mark.id} kind="web" size={20} />}
    />
  );
}

const TRIGGER_GLYPHS: Record<OpsTrigger, Icon> = {
  interval: RepeatIcon,
  calendar: CalendarDotsIcon,
  keepalive: HeartbeatIcon,
  watch: EyeIcon,
  manual: HandTapIcon,
  sampled: GaugeIcon,
};

/** How launchd starts an entry as one muted glyph: its label and cadence
 * are the tooltip and accessible name. */
export function TriggerMark({
  entry,
  status,
}: {
  entry: Pick<OpsCatalogEntry, "trigger" | "schedule" | "kind">;
  status: OpsServiceView["status"];
}) {
  const facts = opsTriggerFacts(entry, status);
  if (!facts || !entry.trigger) return null;
  const Glyph = TRIGGER_GLYPHS[entry.trigger];
  const name = facts.cadence ? `${facts.label}, ${facts.cadence}` : facts.label;
  return (
    <span className="ops-trigger" role="img" aria-label={name} title={name}>
      <Glyph weight="regular" aria-hidden="true" />
    </span>
  );
}

/** A trigger in words, for a panel: its glyph, label and cadence. A cadence
 * that is the schedule itself is left to the Schedule row above it. */
export function TriggerText({
  entry,
  status,
}: {
  entry: Pick<OpsCatalogEntry, "trigger" | "schedule" | "kind">;
  status: OpsServiceView["status"];
}) {
  const facts = opsTriggerFacts(entry, status);
  if (!facts || !entry.trigger) return null;
  const Glyph = TRIGGER_GLYPHS[entry.trigger];
  const cadence =
    facts.cadence && facts.cadence !== entry.schedule?.trim()
      ? facts.cadence
      : null;
  return (
    <span className="ops-inline">
      <Glyph weight="regular" aria-hidden="true" className="ops-inline-glyph" />
      {cadence ? `${facts.label}, ${cadence}` : facts.label}
    </span>
  );
}

/** The last success, live, judged against the entry's own budget: over it,
 * the time takes the warning ink and a glyph whose tooltip names the budget.
 * A null budget is liveness only and is never judged. */
export function LastSuccess({
  service,
  now,
  empty,
}: {
  service: OpsServiceView;
  now?: number;
  empty?: string;
}) {
  const over = useLiveText(
    (live) => {
      const freshness = opsFreshness(service, live);
      return freshness.kind === "budget" && freshness.overBudget
        ? secondsText(freshness.budgetSeconds)
        : "";
    },
    Date.now(),
    now,
  );
  const at = service.status.last_success_at;
  // System recorded no success: that is not the same as never succeeding.
  if (!at)
    return empty ? (
      <RelativeTime value={null} empty={empty} />
    ) : (
      <span className="sr-only">Not recorded</span>
    );
  return (
    <span className="ops-last" data-over={over ? "true" : undefined}>
      <RelativeTime value={at} now={now} />
      {over && (
        <span
          className="ops-over"
          role="img"
          aria-label={`Over its ${over} budget`}
          title={`Over its ${over} budget`}
        >
          <WarningCircleIcon weight="regular" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}

/** The next run: "in 12m", "due now", "3m overdue". An interval job's is
 * approximate (launchd does not expose its timer): a tilde, and a tooltip
 * that says so. It is overdue only past the entry's own budget, and one
 * that cannot be known is not shown (see `opsNextRun`). */
export function NextDue({
  service,
  now,
}: {
  service: OpsServiceView;
  now?: number;
}) {
  const next = opsNextRun(service);
  if (!next)
    return (
      <span className="sr-only">
        {service.status.next_run_at ? "Not known" : "Not scheduled"}
      </span>
    );
  const { at, approximate, graceS } = next;
  return (
    <span
      className="ops-due"
      title={
        approximate ? "Approximate: the last run plus its interval" : undefined
      }
    >
      {approximate && (
        <>
          <span className="ops-approx" aria-hidden="true">
            ~
          </span>
          <span className="sr-only">about </span>
        </>
      )}
      <DueTime value={at} now={now} graceS={graceS} />
    </span>
  );
}

/** The warning chip for entries whose check was never proven (a restore
 * drill that never ran), with a count when it summarises several. */
export function UnverifiedBadge({ count }: { count?: number }) {
  return (
    <StateBadge
      tone="warning"
      label={count === undefined ? "Unverified" : `${count} Unverified`}
      icon={
        <SealQuestionIcon
          weight="regular"
          aria-hidden="true"
          className="workspace-state-mark"
        />
      }
    />
  );
}

/**
 * An entry's state: in a state column (`cell`) a quiet dot for ok and a
 * chip otherwise; elsewhere a chip only for an exception. A restore drill
 * that never ran reads Unverified, never ok.
 */
export function EntryState({
  service,
  cell = false,
}: {
  service: OpsServiceView;
  cell?: boolean;
}) {
  if (opsUnverified(service)) return <UnverifiedBadge />;
  return cell ? (
    <StateCell domain="ops" state={service.status.state} />
  ) : (
    <StateBadge domain="ops" state={service.status.state} />
  );
}

/** A run's result: a quiet dot for exit 0, a critical chip for any other
 * code, and plain text when launchd reports none ("Started" for a
 * keepalive, which runs until it stops). */
export function RunResult({
  exit,
  trigger,
  labelled = false,
}: {
  exit: number | null;
  trigger?: OpsTrigger | null;
  /** Also write "Exit 0" beside the quiet dot, for a list with no column
   * header to name it. */
  labelled?: boolean;
}) {
  if (exit === null)
    return (
      <span className="ops-muted">
        {trigger === "keepalive" ? "Started" : "No exit code"}
      </span>
    );
  if (exit !== 0) return <StateBadge tone="critical" label={`Exit ${exit}`} />;
  const dot = (
    <span
      className="workspace-state-quiet"
      data-tone="positive"
      role={labelled ? undefined : "img"}
      aria-label={labelled ? undefined : "Exit 0"}
      title="Exit 0"
    >
      <StatusDot variant="success" label="Exit 0" aria-hidden="true" />
    </span>
  );
  if (!labelled) return dot;
  return (
    <span className="ops-run-ok">
      {dot}
      <span className="ops-muted">Exit 0</span>
    </span>
  );
}

/** An HTTP status as a colour-coded chip: 2xx green, 3xx neutral, 4xx
 * orange, 5xx red. The code is always its text. */
export function HttpStatus({ status }: { status: number }) {
  const tone =
    status >= 500
      ? "critical"
      : status >= 400
        ? "warning"
        : status >= 300
          ? "neutral"
          : "positive";
  return <StateBadge tone={tone} label={String(status)} />;
}

/** A state an incident was in, now past: its name in muted ink, never a
 * chip, so it never reads as current. */
export function PastState({
  state,
  was = false,
}: {
  state: OpsState;
  /** Say "was failing", for a row with no column header to say it. */
  was?: boolean;
}) {
  const label = badgeFor("ops", state).label;
  return (
    <span className="ops-past" data-state={state}>
      {was ? `was ${label.toLowerCase()}` : label}
    </span>
  );
}

const noChange = () => () => undefined;

/** A clock time, "Sep 22, 16:02", in the viewer's zone. The server writes
 * the UTC one and the browser swaps in its own after hydration, so the two
 * never disagree. The absolute local and UTC time is the tooltip. */
export function ClockTime({ at, now }: { at: string; now?: number }) {
  const ms = Date.parse(at);
  const text = useSyncExternalStore(
    noChange,
    () => clockText(ms, now),
    () => clockText(ms, now, true),
  );
  return (
    <time
      dateTime={at}
      title={`${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`}
      className="workspace-time"
      suppressHydrationWarning
    >
      {text}
    </time>
  );
}

/** Only the clock, "16:02", for rows grouped under a day heading. */
export function HourTime({ at, now }: { at: string; now?: number }) {
  const ms = Date.parse(at);
  const hour = (utc: boolean) => clockText(ms, now, utc).split(", ").at(-1)!;
  const text = useSyncExternalStore(
    noChange,
    () => hour(false),
    () => hour(true),
  );
  return (
    <time
      dateTime={at}
      title={clockText(ms, now)}
      className="workspace-time"
      suppressHydrationWarning
    >
      {text}
    </time>
  );
}

/** How long something has lasted, live until it ends: "1h 24m". */
export function Lasted({
  from,
  to,
  now,
  serverNow,
}: {
  from: string;
  to?: string | null;
  now?: number;
  serverNow: number;
}) {
  const start = Date.parse(from);
  const end = to ? Date.parse(to) : null;
  const text = useLiveText(
    (live) => durationText(Math.max(0, (end ?? live) - start)) ?? "",
    serverNow,
    end ?? now,
  );
  return (
    <span
      className="workspace-figure workspace-duration"
      suppressHydrationWarning
    >
      {text}
    </span>
  );
}

/** Reader route families as a glyph in the row's tile. */
const ROUTE_GLYPHS: Record<string, Icon> = {
  "activity.activity": LightningIcon,
  "data.get": FileTextIcon,
  "data.record": FileTextIcon,
  "data.search": MagnifyingGlassIcon,
  "data.sources": StackIcon,
  "data.status": DatabaseIcon,
  invalid: WarningOctagonIcon,
  method: ProhibitIcon,
  "ops.events": ListBulletsIcon,
  "ops.snapshot": PulseIcon,
  preflight: HandshakeIcon,
  probe: HeartbeatIcon,
};

/** A reader route's glyph, or the brand whose data it reads. */
export function routeMark(route: string): { icon?: Icon; mark?: string } {
  if (route.startsWith("health.")) return { mark: "applehealth" };
  return { icon: ROUTE_GLYPHS[route] ?? GlobeSimpleIcon };
}
