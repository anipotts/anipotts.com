// @vitest-environment node
import React from "react";
import { expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import sample from "../../fixtures/ops_v1.sample.json";
import events from "../../fixtures/ops_events_v1.synthetic.json";
import { ObservabilityWorkspace } from "./ObservabilityWorkspace";

// Production renders these pages on the server with the reader on. A browser
// global touched during that render throws after the response has started,
// which ships an empty 200 body.
for (const view of ["status", "activity", "alerts"] as const)
  it(`server-renders ${view} with the ops reader on`, () => {
    const html = renderToString(
      <ObservabilityWorkspace
        view={view}
        alert={null}
        enabled
        renderedAt={Date.parse("2026-09-22T00:00:00Z")}
      />,
    );
    expect(html.length).toBeGreaterThan(100);
  });

it("server-renders an open entry and an open alert from fixtures", () => {
  for (const [view, open] of [
    ["status", { entry: "pc.writer" }],
    ["status", { entry: "host.ap-mini" }],
    ["alerts", { alert: "pc.inference" }],
    ["activity", {}],
  ] as const) {
    const html = renderToString(
      <ObservabilityWorkspace
        view={view}
        {...open}
        enabled={false}
        fixture={sample}
        eventsFixture={events}
        renderedAt={Date.parse("2026-09-21T18:00:00Z")}
      />,
    );
    expect(html.length, view).toBeGreaterThan(1000);
    if (view !== "activity") expect(html).toContain("ops-entry-detail");
  }
});

it("server-renders the overview with the ops and data readers on", async () => {
  const { PrivateShell } = await import("../data/PrivateShell");
  const html = renderToString(
    <PrivateShell
      initialPath="/"
      content={[]}
      dataEnabled
      enabled
      renderedAt={Date.parse("2026-09-22T00:00:00Z")}
    />,
  );
  expect(html.length).toBeGreaterThan(100);
});
