import { expect, it, vi } from "vitest";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import reactRenderer from "@astrojs/react/server.js";
import { JSDOM } from "jsdom";
import AdminDocument from "../../src/layouts/AdminDocument.astro";
import AdminLayout from "../../src/layouts/AdminLayout.astro";
import EditorialLayout from "../../src/layouts/EditorialLayout.astro";

// Data boundaries stay synthetic; layouts and renderer are real.
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
const sentinel = "Synthetic private HTML sentinel";
const entry = {
  id: "content:synthetic",
  label: sentinel,
  domain: "content",
  kind: "writing",
  currentFact: "draft",
  source: "synthetic",
  freshness: "current",
  href: "/content/writing/synthetic",
  keywords: ["synthetic"],
};
async function render(component, path, props) {
  const container = await AstroContainer.create();
  container.addServerRenderer({
    name: "@astrojs/react",
    renderer: reactRenderer,
  });
  container.addClientRenderer({
    name: "@astrojs/react",
    entrypoint: "@astrojs/react/client.js",
  });
  const response = await container.renderToResponse(component, {
    props,
    slots: { default: `<p>${sentinel}</p>` },
    request: new Request(`http://localhost${path}`),
    partial: false,
  });
  const html = await response.text();
  return { html, document: new JSDOM(html).window.document };
}
it.each([
  [AdminLayout, "/?q=private", { title: "Synthetic", searchEntries: [entry] }],
  [
    EditorialLayout,
    "/content/writing?sort=title&q=private",
    {
      title: "Synthetic",
      selectedGroup: "writing",
      hasContent: true,
      inventoryProjection: {
        records: [],
        groups: [],
        searchEntries: [entry],
        unavailable: false,
      },
    },
  ],
])(
  "both real layouts capture the document epoch before styles/islands and fence private SSR",
  async (component, path, props) => {
    const { document } = await render(component, path, props);
    const bootstrap = [...document.head.querySelectorAll("script")].find(
      (script) => script.textContent.includes("__adminDocumentSession"),
    );
    expect(bootstrap).toBeTruthy();
    expect(document.head.querySelector("script")).toBe(bootstrap);
    for (const blocker of document.querySelectorAll(
      'style,link[rel="stylesheet"],astro-island',
    ))
      expect(bootstrap.compareDocumentPosition(blocker) & 4).toBe(4);
    const fence = document.querySelector("[data-admin-private-document]");
    expect(fence?.textContent).toContain(sentinel);
    expect(fence?.querySelector("astro-island[props]")).not.toBeNull();
    expect(
      document
        .querySelector("astro-island")
        ?.closest("[data-admin-private-document]"),
    ).toBe(fence);
  },
);
it("auth and logout standalone documents retain inert access to explicit cleanup", async () => {
  const { document } = await render(AdminDocument, "/auth/logout", {
    title: "Sign out",
    shell: false,
  });
  expect(document.querySelector("[data-admin-private-document]")).toBeNull();
  expect(document.documentElement.outerHTML).not.toContain(
    "__adminDocumentSession",
  );
  expect(document.body.textContent).toContain(sentinel);
});
