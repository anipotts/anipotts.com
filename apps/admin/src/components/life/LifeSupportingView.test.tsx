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
