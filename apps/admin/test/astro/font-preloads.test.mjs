import { describe, expect, it, vi } from "vitest";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import reactRenderer from "@astrojs/react/server.js";
import { JSDOM } from "jsdom";
import CatalogPage from "../../src/dev/dev-catalog.astro";
import AlertsPage from "../../src/pages/observability/[view].astro";

// Both layouts preload the fonts every page renders with. Without the
// preload, `font-display: optional` in styles/fonts.css would often miss the
// block window and leave the page in the fallback font.
vi.mock("../../src/lib/editorial-content", () => ({
  publicSiteUrl: "https://example.com",
  editorialInventory: async () => ({ pages: [], projects: [], writing: [] }),
  recordUpdate: () => null,
}));
vi.mock("../../src/lib/editorial-inventory-server", () => ({
  loadEditorialInventory: async () => ({
    records: [],
    groups: [],
    searchEntries: [],
    unavailable: false,
  }),
}));

async function head(page, path, params) {
  const container = await AstroContainer.create();
  container.addServerRenderer({
    name: "@astrojs/react",
    renderer: reactRenderer,
  });
  container.addClientRenderer({
    name: "@astrojs/react",
    entrypoint: "@astrojs/react/client.js",
  });
  const response = await container.renderToResponse(page, {
    request: new Request(`http://localhost${path}`),
    partial: false,
    params,
  });
  return new JSDOM(await response.text()).window.document.head;
}

function fontPreloads(head) {
  return [...head.querySelectorAll('link[rel="preload"][as="font"]')].map(
    (link) => ({
      file: link.getAttribute("href")?.split("/").pop()?.split("?")[0],
      type: link.getAttribute("type"),
      crossorigin: link.hasAttribute("crossorigin"),
    }),
  );
}

const expected = [
  {
    file: "instrument-sans-latin-wght-normal.woff2",
    type: "font/woff2",
    crossorigin: true,
  },
  {
    file: "APStructuralDisplayBlack-v0.2.0-candidate.1.woff2",
    type: "font/woff2",
    crossorigin: true,
  },
];

describe("font preloads", () => {
  it("EditorialLayout preloads the body and wordmark fonts", async () => {
    const preloads = fontPreloads(
      await head(CatalogPage, "/content/dev-catalog"),
    );
    expect(preloads).toEqual(expected);
  });

  it("AdminLayout preloads the same fonts", async () => {
    const preloads = fontPreloads(
      await head(AlertsPage, "/observability/alerts", { view: "alerts" }),
    );
    expect(preloads).toEqual(expected);
  });
});
