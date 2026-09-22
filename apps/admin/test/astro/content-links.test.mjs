import { describe, expect, it } from "vitest";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { JSDOM } from "jsdom";
import InlineMention from "../../../www/src/components/InlineMention.astro";

const destinations = [
  ["Section", "#details", null],
  ["Project", "/work/example#details", null],
  ["Email", "mailto:owner@example.com?subject=Hello", null],
  ["Website", "https://example.com/path#details", "_blank"],
  ["Uppercase scheme", "HTTPS://example.com/path", "_blank"],
];

async function render(Component, props) {
  const container = await AstroContainer.create();
  const html = await container.renderToString(Component, { props });
  return new JSDOM(html).window.document;
}

function expectDestination(anchor, href, target) {
  expect(anchor?.getAttribute("href")).toBe(href);
  expect(anchor?.getAttribute("target")).toBe(target);
  expect(anchor?.getAttribute("rel")).toBe(
    target === "_blank" ? "noopener noreferrer" : null,
  );
}

describe("rendered content link destinations", () => {
  it.each(destinations)(
    "InlineMention preserves navigation context for %s",
    async (label, href, target) => {
      const document = await render(InlineMention, { label, href });
      expectDestination(document.querySelector("a"), href, target);
    },
  );
});
