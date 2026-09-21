import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LifeSupportingView } from "./LifeSupportingView";

it("distinguishes an unavailable health read from a successful empty read", () => {
  const unavailable = renderToStaticMarkup(
    <LifeSupportingView section="health" available={false} />,
  );
  expect(unavailable).toContain("Health summaries could not be loaded.");
  expect(unavailable).not.toContain("No health summaries available.");
  const empty = renderToStaticMarkup(
    <LifeSupportingView section="health" available />,
  );
  expect(empty).toContain("No health summaries available.");
  expect(empty).not.toContain("could not be loaded");
});

it("identifies fixture and retained projection provenance without claiming connected records", () => {
  const summaries = [
    {
      title: "Synthetic summary",
      summary: "Example only",
      freshness_state: "unknown",
      reveal_policy: "summary",
      source_locator: "synthetic",
    },
  ];
  const fixture = renderToStaticMarkup(
    <LifeSupportingView
      section="health"
      summaries={summaries}
      sourceMode="fixture"
    />,
  );
  expect(fixture).toContain(
    "Development examples. These are not connected personal records.",
  );
  const retained = renderToStaticMarkup(
    <LifeSupportingView
      section="health"
      summaries={summaries}
      sourceMode="adapter"
    />,
  );
  expect(retained).toContain(
    "previous knowledge projection, not the canonical Data reader",
  );
});
