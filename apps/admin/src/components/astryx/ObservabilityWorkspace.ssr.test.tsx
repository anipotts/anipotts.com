// @vitest-environment node
import React from "react";
import { expect, it } from "vitest";
import { renderToString } from "react-dom/server";
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
