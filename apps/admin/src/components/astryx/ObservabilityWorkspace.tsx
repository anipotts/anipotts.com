import React, { useEffect, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { TextInput } from "@astryxdesign/core/TextInput";
import {
  SERVICE_INVENTORY,
  deriveServiceState,
  parseObservabilitySnapshot,
} from "../../lib/observability-model";
import type { ObservabilityReadResult } from "../../lib/observability-reader";
import "./observability.css";

const words = (value: string) => value.replaceAll("-", " ");
const label = (id: string) =>
  SERVICE_INVENTORY.find((item) => item.id === id)?.label ?? id;

export function ObservabilityWorkspace({
  initial,
}: {
  initial: ObservabilityReadResult;
}) {
  const [result, setResult] = useState(initial);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("coverage");
  const [retry, setRetry] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    // A disconnected configuration never becomes an accidental background consumer.
    if (initial.status === "unconfigured" && retry === 0) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    async function refresh() {
      setRefreshing(true);
      try {
        const response = await fetch("/api/admin/observability", {
          signal: AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]),
          credentials: "same-origin",
          cache: "no-store",
          redirect: "error",
        });
        if (!response.ok) throw new Error("unavailable");
        const reader = response.body?.getReader();
        if (!reader) throw new Error("unavailable");
        let text = "";
        let bytes = 0;
        const decoder = new TextDecoder();
        try {
          for (;;) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.byteLength;
            if (bytes > 262144) throw new Error("limit");
            text += decoder.decode(part.value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          void reader.cancel().catch(() => undefined);
        }
        const body = JSON.parse(text);
        if (!["connected", "unconfigured"].includes(body.status))
          throw new Error("unavailable");
        const snapshot = parseObservabilitySnapshot(body.snapshot);
        if ((body.status === "connected") !== (snapshot.source === "live"))
          throw new Error("unavailable");
        if (abort.signal.aborted) return;
        setResult({ status: body.status, snapshot });
        failures = 0;
        if (body.status === "unconfigured") return;
      } catch {
        if (abort.signal.aborted) return;
        failures++;
        setResult((previous) => ({ ...previous, status: "disconnected" }));
      } finally {
        if (!abort.signal.aborted) setRefreshing(false);
      }
      if (!abort.signal.aborted)
        timer = setTimeout(refresh, Math.min(30000, 1000 * 2 ** failures));
    }
    void refresh();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [initial.status, retry]);
  const { snapshot, status } = result;
  const matches = (...values: string[]) =>
    values.join(" ").toLowerCase().includes(query.trim().toLowerCase());
  const services = snapshot.services.filter((service) =>
    matches(label(service.id), service.id, deriveServiceState(service, now)),
  );
  const events = snapshot.events.filter((event) =>
    matches(label(event.serviceId), event.kind, event.evidenceId),
  );
  const spans = snapshot.spans.filter((span) =>
    matches(label(span.serviceId), span.traceId, span.operation),
  );
  const metrics = snapshot.metrics.filter((metric) =>
    matches(label(metric.serviceId), metric.name),
  );
  const incidents = snapshot.incidents.filter((incident) =>
    matches(label(incident.serviceId), incident.state, incident.evidenceId),
  );
  return (
    <main className="observability-workspace">
      <VStack gap={6}>
        <header>
          <h1>Observability</h1>
          <p>Coverage and operational evidence across your personal system.</p>
        </header>
        <Banner
          status={status === "connected" ? "info" : "warning"}
          title={
            status === "connected"
              ? "Telemetry connected"
              : status === "unconfigured"
                ? "Live telemetry is not connected"
                : "Telemetry connection lost"
          }
          description={
            status === "unconfigured"
              ? "The starting inventory is visible. Runtime enrollment and a reviewed read connection are pending."
              : status === "disconnected"
                ? "Last received evidence is retained. Current service health is unknown while reconnection is attempted."
                : "Connection status describes this read feed. Each component has its own observation and freshness."
          }
        />
        <HStack gap={3} wrap="wrap">
          <Button
            label={refreshing ? "Connecting…" : "Reconnect"}
            clickAction={() => setRetry((value) => value + 1)}
          />
          <span role="status">
            {status === "connected"
              ? `Snapshot ${snapshot.observedAt}`
              : status === "unconfigured"
                ? "No live observations received"
                : "Disconnected"}
          </span>
        </HStack>
        <p>
          Operations is optional. Project execution and incident detection run
          independently of this page.
        </p>
        <nav aria-label="Observability views" className="observability-tabs">
          {["coverage", "activity", "traces", "metrics", "incidents"].map(
            (tab) => (
              <button
                key={tab}
                type="button"
                aria-pressed={view === tab}
                onClick={() => setView(tab)}
              >
                {words(tab)}
              </button>
            ),
          )}
        </nav>
        <div>
          <TextInput
            label="Search evidence"
            value={query}
            onChange={setQuery}
            placeholder="Service, state, trace or evidence ID"
          />
        </div>
        {view === "coverage" && (
          <section aria-label="Service coverage">
            <h2>Service coverage</h2>
            <p>
              This starting inventory is incomplete until System supplies the
              enrolled service register. Source groups alone do not prove
              capture coverage.
            </p>
            <div className="observability-grid">
              {services.map((service) => (
                <article key={service.id}>
                  <h3>{label(service.id)}</h3>
                  <dl>
                    <dt>Observed state</dt>
                    <dd>
                      {status === "disconnected"
                        ? "disconnected"
                        : words(deriveServiceState(service, now))}
                    </dd>
                    <dt>Instrumentation</dt>
                    <dd>
                      {service.instrumentation === "unknown"
                        ? "Not verified"
                        : service.instrumentation}
                    </dd>
                    <dt>Last observation</dt>
                    <dd>{service.lastObservedAt ?? "Not observed"}</dd>
                    <dt>Last outcome</dt>
                    <dd>{service.outcome}</dd>
                  </dl>
                </article>
              ))}
            </div>
            {services.length === 0 && (
              <EmptyState
                title="No matching components"
                description="Clear the search to see the starting inventory."
              />
            )}
          </section>
        )}
        {view === "activity" && (
          <section aria-label="Operational activity">
            <h2>Committed activity</h2>
            <p>
              Replayed checkpoints identify committed changes. They do not
              measure execution time.
            </p>
            {events.map((event) => (
              <article
                key={`${event.serviceId}:${event.evidenceId}:${event.kind}`}
              >
                <h3>
                  {label(event.serviceId)} · {words(event.kind)}
                </h3>
                <p>{event.at}</p>
                <code>{event.evidenceId}</code>
              </article>
            ))}
            {!events.length && (
              <EmptyState
                title="No matching activity"
                description="No committed activity is available in this snapshot for this search."
              />
            )}
          </section>
        )}
        {view === "traces" && (
          <section aria-label="Execution traces">
            <h2>Measured execution</h2>
            {spans.map((span) => (
              <article key={`${span.traceId}:${span.spanId}`}>
                <h3>
                  {label(span.serviceId)} · {span.operation}
                </h3>
                <p>
                  {span.durationMs} ms · {span.outcome} · {span.startedAt}
                </p>
                <code>Trace {span.traceId}</code>
                <br />
                <code>Span {span.spanId}</code>
              </article>
            ))}
            {!spans.length && (
              <EmptyState
                title="No measured spans available"
                description="Actual execution instrumentation is required before latency can be shown."
              />
            )}
          </section>
        )}
        {view === "metrics" && (
          <section aria-label="Operational metrics">
            <h2>Capacity and retention</h2>
            <p>
              Required policy: 30 days of detail and 13 months of aggregates.
              Aggregate production and measured disk enforcement remain
              unverified until observed.
            </p>
            {metrics.map((metric) => (
              <article key={`${metric.serviceId}:${metric.name}:${metric.at}`}>
                <h3>
                  {label(metric.serviceId)} · {words(metric.name)}
                </h3>
                <p>
                  {metric.value} · Observed {metric.at}
                </p>
              </article>
            ))}
            {!metrics.length && (
              <EmptyState
                title="No measured metrics available"
                description="Missing measurements are unknown, including disk use, queue depth and retention."
              />
            )}
          </section>
        )}
        {view === "incidents" && (
          <section aria-label="PersonalContext incident pilot">
            <h2>PersonalContext incident pilot</h2>
            <p>
              Deterministic detection is independent of optional AI
              investigation. Gmail and a distinct iMessage sender require
              verified routes and native sending controls.
            </p>
            {incidents.map((incident) => (
              <article key={`${incident.evidenceId}:${incident.state}`}>
                <h3>
                  {label(incident.serviceId)} · {words(incident.state)}
                </h3>
                <p>Next action: {words(incident.nextAction)}</p>
                <p>{incident.at}</p>
                <code>{incident.evidenceId}</code>
              </article>
            ))}
            {!incidents.length && (
              <EmptyState
                title="No incident evidence available"
                description="This does not establish that the system is incident-free. Incident evidence remains separate from personal history."
              />
            )}
          </section>
        )}
      </VStack>
    </main>
  );
}
