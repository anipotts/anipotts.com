import React, { useMemo } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { VStack } from "@astryxdesign/core/VStack";
import {
  ArrowBendUpLeftIcon,
  BellSimpleRingingIcon,
  PulseIcon,
  RepeatIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { opsFreshness, opsIsHost, type OpsServiceView } from "../../lib/ops-v1";
import type { OpsAlert, OpsTransitionEvent } from "../../lib/ops-events";
import {
  opsAlertStartBound,
  opsIncidentsBySubject,
} from "../../lib/ops-events";
import {
  opsCadenceText,
  opsNextRun,
  opsDetailDisk,
  opsHostFacts,
  opsRecordsRuns,
  opsRunHistory,
  opsSyncWithheld,
} from "../../lib/ops-view";
import { deviceName } from "../../lib/naming";
import { sentenceCase } from "../../lib/sentence-case";
import { SplitPanel, useSplitView } from "../astryx/SplitView";
import {
  DefinitionList,
  DetailText,
  Duration,
  Figure,
  RelativeTime,
  StateBadge,
  StateCell,
  StateTransition,
  TechnicalSection,
} from "../workspace/Workspace";
import { secondsText } from "../workspace/format";
import {
  AlertFor,
  AlertStart,
  ClockTime,
  DeviceTile,
  EntryState,
  EntryTile,
  LastRun,
  LastSuccess,
  NextDue,
  PastState,
  RunResult,
  RunbookButton,
  TriggerText,
  entryKeep,
  entryNaming,
} from "./cells";
import { opsEventsGap, type OpsData } from "./frame";
import { opsSelectionHref } from "./selection";

/** Changes and runs a panel lists, newest first. */
const PANEL_ROWS = 12;

export const OPS_PANEL_ID = "ops-entry-detail";

/**
 * One entry, beside its list on a wide screen and as the page on a narrow
 * one (SplitView): its state and catalog facts, the runbook as an action,
 * its recent runs, its changes of state and, for an alert, its incidents.
 * The header stays pinned while the body scrolls.
 */
export function EntryPanel({
  service,
  alert,
  data,
  onClose,
  panelRef,
  backLabel,
}: {
  service: OpsServiceView | null;
  /** The alert this panel opens for, on Alerts. */
  alert?: OpsAlert & { name: string; keep?: string; runbook: string | null };
  data: OpsData;
  onClose: () => void;
  panelRef: React.Ref<HTMLElement>;
  backLabel: string;
}) {
  const subject = service?.id ?? alert!.subject;
  const naming = entryNaming(
    service ?? { id: subject, name: alert?.name ?? subject },
    data.names,
  );
  const name = alert?.name ?? naming.name;
  const now = data.fixedNow;
  const transitions = useMemo(
    () =>
      (data.events?.transitions ?? [])
        .filter((event) => event.subject === subject)
        .slice(-PANEL_ROWS)
        .reverse(),
    [data.events, subject],
  );
  const incidents = useMemo(
    () =>
      opsIncidentsBySubject(data.events?.transitions ?? []).get(subject) ?? [],
    [data.events, subject],
  );
  const firing = alert
    ? alert.status === "firing"
    : incidents[0]?.status === "firing";
  const runbook = service?.runbook ?? alert?.runbook ?? null;
  const gap = opsEventsGap(data);
  return (
    <SplitPanel
      ref={panelRef}
      id={OPS_PANEL_ID}
      tabIndex={-1}
      aria-label={`${name} details`}
      className="ops-panel"
      header={
        <PanelHeader
          naming={naming}
          name={name}
          keep={
            alert?.keep ??
            entryKeep(service ?? { id: subject, name }, data.names)
          }
          onClose={onClose}
          backLabel={backLabel}
          badge={
            alert ? (
              alert.status === "firing" ? (
                <StateCell domain="ops" state={alert.state} />
              ) : (
                <StateBadge domain="alert" state="resolved" />
              )
            ) : service ? (
              <EntryState service={service} cell />
            ) : null
          }
        />
      }
    >
      <VStack gap={6}>
        {alert ? (
          <IncidentFacts alert={alert} data={data} />
        ) : (
          service && <EntryFacts service={service} now={now} />
        )}
        <HStack gap={2} wrap="wrap" className="ops-panel-actions">
          {runbook && <RunbookButton path={runbook} />}
          {alert ? (
            <Button
              label="Open in Status"
              href={opsSelectionHref("/observability/status", "entry", subject)}
              size="sm"
              variant="ghost"
              icon={<PulseIcon weight="regular" aria-hidden="true" />}
            />
          ) : (
            firing && (
              <Button
                label="Open alert"
                href={opsSelectionHref(
                  "/observability/alerts",
                  "alert",
                  subject,
                )}
                size="sm"
                variant="ghost"
                icon={
                  <BellSimpleRingingIcon weight="regular" aria-hidden="true" />
                }
              />
            )
          )}
        </HStack>
        {!alert && service && !opsIsHost(service) && (
          <RunHistory service={service} data={data} gap={gap} />
        )}
        {alert && incidents.length > 1 && (
          <PanelSection title="Incidents">
            <ol
              className="ops-list"
              aria-label={`${name} incidents`}
              // A start known only as a bound reads "Before Sep 22, 17:26",
              // wider than a clock time: every row's first column widens.
              data-bounded={
                incidents.some((incident) => !incident.since) ? "" : undefined
              }
            >
              {incidents.map((incident) => (
                <li
                  key={opsAlertStartBound(incident)}
                  className="ops-list-item"
                >
                  <AlertStart alert={incident} now={now} clock />
                  <span className="ops-list-state">
                    {incident.status === "firing" ? (
                      <StateBadge domain="ops" state={incident.state} />
                    ) : (
                      <PastState state={incident.peak} />
                    )}
                  </span>
                  <span className="ops-list-figure">
                    <AlertFor
                      alert={incident}
                      now={now}
                      serverNow={data.serverNow}
                    />
                  </span>
                </li>
              ))}
            </ol>
          </PanelSection>
        )}
        <PanelSection title="Changes">
          {gap && <EventsGap text={gap} />}
          {transitions.length ? (
            <ChangeList events={transitions} now={now} label={name} />
          ) : (
            !gap && (
              <p className="ops-muted ops-panel-empty">No changes recorded</p>
            )
          )}
        </PanelSection>
        <TechnicalSection
          items={[
            { label: "Catalog ID", value: subject },
            { label: "Runbook path", value: runbook },
          ]}
        />
      </VStack>
    </SplitPanel>
  );
}

function PanelHeader({
  naming,
  name,
  keep,
  badge,
  onClose,
  backLabel,
}: {
  naming: ReturnType<typeof entryNaming>;
  name: string;
  /** The host suffix the title never breaks (entryKeep). */
  keep?: string;
  badge: React.ReactNode;
  onClose: () => void;
  backLabel: string;
}) {
  // Beside the list the panel closes; as the page it goes back.
  const beside = useSplitView();
  return (
    <div className="ops-panel-header">
      <Button
        label={beside ? "Close" : backLabel}
        tooltip={beside ? "Close" : backLabel}
        isIconOnly
        size="sm"
        variant="ghost"
        icon={
          beside ? (
            <XIcon weight="regular" aria-hidden="true" />
          ) : (
            <ArrowBendUpLeftIcon weight="regular" aria-hidden="true" />
          )
        }
        onClick={onClose}
      />
      <EntryTile naming={naming} size={28} />
      <Heading level={2} className="ops-panel-title">
        <span title={naming.tooltip}>
          {keep && name.endsWith(keep) ? (
            <>
              {name.slice(0, -keep.length)}
              <span className="ops-panel-keep">{keep}</span>
            </>
          ) : (
            name
          )}
        </span>
      </Heading>
      {badge && <span className="ops-panel-badge">{badge}</span>}
    </div>
  );
}

function PanelSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <section aria-labelledby={id} className="ops-panel-section">
      <Heading level={3} id={id} className="ops-panel-heading">
        {title}
      </Heading>
      {children}
    </section>
  );
}

/** An entry's state, times and catalog facts, empty ones left out. */
function EntryFacts({
  service,
  now,
}: {
  service: OpsServiceView;
  now?: number;
}) {
  const { status } = service;
  const host = opsIsHost(service) ? opsHostFacts(service) : null;
  const budget = service.freshness_budget_s;
  const freshness = opsFreshness(service, now ?? Date.now());
  const exit = status.last_exit;
  return (
    <DefinitionList
      label="Facts"
      items={[
        // A host's detail is its disk figure, which the Disk row says.
        [
          "Detail",
          host?.disk != null && host.disk === opsDetailDisk(status.detail)
            ? null
            : status.detail,
        ],
        ...(host
          ? ([
              [
                "Disk",
                host.disk === null ? null : (
                  <span className="workspace-figure">{host.disk}% used</span>
                ),
              ],
              ["Awake", host.awake === null ? null : host.awake ? "Yes" : "No"],
              [
                "Uptime",
                host.uptimeS === null ? null : secondsText(host.uptimeS),
              ],
              [
                "Sampled",
                <RelativeTime key="sampled" value={host.sampledAt} now={now} />,
              ],
            ] as const)
          : ([
              [
                "Last success",
                <span key="success" className="ops-inline">
                  <LastSuccess
                    service={service}
                    now={now}
                    empty="Not recorded"
                  />
                  {budget !== null &&
                    !opsSyncWithheld(service) &&
                    freshness.kind === "budget" &&
                    freshness.overBudget && (
                      <span className="ops-warning">
                        over its {secondsText(budget)} budget
                      </span>
                    )}
                </span>,
              ],
              [
                "Last run",
                status.last_run_at || opsSyncWithheld(service) ? (
                  <LastRun key="run" service={service} now={now} />
                ) : null,
              ],
              [
                "Exit",
                exit === null ? null : (
                  <RunResult key="exit" exit={exit} labelled />
                ),
              ],
              [
                "Took",
                status.last_duration_s === null ? null : (
                  <Duration seconds={status.last_duration_s} />
                ),
              ],
              [
                "Next run",
                opsNextRun(service) ? (
                  <NextDue service={service} now={now} />
                ) : null,
              ],
            ] as const)),
        ["Schedule", service.schedule],
        [
          "Trigger",
          service.trigger ? (
            <TriggerText entry={service} status={status} />
          ) : null,
        ],
        [
          "Runs",
          status.runs === null ? null : (
            <Figure value={status.runs} noun={["run", "runs"]} />
          ),
        ],
        [
          "Freshness budget",
          budget === null ? "None, liveness only" : secondsText(budget),
        ],
        [
          "Host",
          <span key="host" className="ops-inline">
            <DeviceTile device={service.host} />
            {deviceName(service.host)}
          </span>,
        ],
        ["Group", sentenceCase(service.group)],
      ]}
    />
  );
}

/** An alert's incident: the state it is or was in, when it started, when
 * it resolved, how long it lasted and what System said. */
function IncidentFacts({ alert, data }: { alert: OpsAlert; data: OpsData }) {
  const firing = alert.status === "firing";
  return (
    <DefinitionList
      label="Incident"
      items={[
        // A firing alert's state is the header's chip; a resolved one names
        // the worst state it reached.
        ["Was", firing ? null : <PastState key="was" state={alert.peak} />],
        [
          "Started",
          <AlertStart
            key="since"
            alert={alert}
            now={data.fixedNow}
            clock
            note
          />,
        ],
        [
          "Resolved",
          alert.resolvedAt ? (
            <ClockTime at={alert.resolvedAt} now={data.fixedNow} />
          ) : null,
        ],
        [
          firing ? "For" : "Lasted",
          <AlertFor
            key="lasted"
            alert={alert}
            now={data.fixedNow}
            serverNow={data.serverNow}
          />,
        ],
        ["Detail", alert.detail],
      ]}
    />
  );
}

/** Events the panel's lists may be missing (opsEventsGap), as one quiet
 * line where an empty list would otherwise read as nothing happened. */
function EventsGap({ text }: { text: string }) {
  return (
    <p className="ops-inline ops-panel-empty ops-panel-gap">
      <WarningCircleIcon
        weight="regular"
        aria-hidden="true"
        className="ops-inline-glyph"
      />
      {text}
    </p>
  );
}

/** A job's recent runs from System's run events. A job that runs more often
 * than every 15 minutes has none recorded, so it says how often it runs.
 * When the events are not whole, the list says so, and never reads "No runs
 * recorded" for runs it could not read. */
function RunHistory({
  service,
  data,
  gap,
}: {
  service: OpsServiceView;
  data: OpsData;
  gap: string | null;
}) {
  const runs = useMemo(
    () => opsRunHistory(data.events?.runs ?? [], service.id, PANEL_ROWS),
    [data.events, service.id],
  );
  const now = data.fixedNow;
  const interval = service.status.interval_s;
  return (
    <PanelSection title="Runs">
      {!opsRecordsRuns(service.status) && interval !== null ? (
        <p className="ops-inline ops-panel-empty">
          <RepeatIcon
            weight="regular"
            aria-hidden="true"
            className="ops-inline-glyph"
          />
          {sentenceCase(`runs ${opsCadenceText(interval)}`)}
        </p>
      ) : runs.length ? (
        <>
          {gap && <EventsGap text={gap} />}
          <ol className="ops-list" aria-label={`${service.name} runs`}>
            {runs.map((run) => (
              <li key={run.key} className="ops-list-item">
                <ClockTime at={run.at} now={now} />
                <span className="ops-list-state">
                  <RunResult
                    exit={run.exit}
                    trigger={service.trigger}
                    labelled
                  />
                  {run.runs > 1 && (
                    <span className="ops-muted workspace-figure">
                      {run.runs} runs
                    </span>
                  )}
                </span>
                <span className="ops-list-figure">
                  <Duration ms={run.ms} />
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : gap ? (
        <EventsGap text={gap} />
      ) : (
        <p className="ops-muted ops-panel-empty">No runs recorded</p>
      )}
    </PanelSection>
  );
}

/** Changes of state, newest first: the time, the two states, the detail. */
export function ChangeList({
  events,
  now,
  label,
}: {
  events: readonly OpsTransitionEvent[];
  now?: number;
  label: string;
}) {
  return (
    <ol className="ops-list" aria-label={`${label} changes`}>
      {events.map((event) => (
        <li key={event.seq} className="ops-list-item" data-change="">
          <ClockTime at={event.at} now={now} />
          <span className="ops-list-state">
            <StateTransition domain="ops" from={event.from} to={event.to} />
          </span>
          {event.detail && (
            <span className="ops-list-detail">
              <DetailText>{event.detail}</DetailText>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
