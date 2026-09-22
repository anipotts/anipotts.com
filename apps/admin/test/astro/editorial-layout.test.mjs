import { beforeEach, describe, expect, it, vi } from "vitest";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import reactRenderer from "@astrojs/react/server.js";
import { JSDOM } from "jsdom";
import RecordPage from "../../src/pages/content/[collection]/[id].astro";
import CatalogPage from "../../src/dev/dev-catalog.astro";

// Only data boundaries are synthetic. Astro compiles the real routes/layout and
// renders the real React shell, including slot handling and island instructions.
const boundary = vi.hoisted(() => ({ unavailable: false, draft: null }));

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
vi.mock("../../src/lib/editorial-local", () => ({
  localDraftStorage: async () => ({
    get: async () => {
      if (boundary.unavailable) throw new Error("storage_unavailable");
      return boundary.draft;
    },
  }),
}));

async function render(page, path, params = {}) {
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
    params,
    partial: false,
  });
  const html = await response.text();
  const document = new JSDOM(html).window.document;
  return { status: response.status, document };
}

describe("EditorialLayout Astro rendering", () => {
  beforeEach(() => {
    boundary.unavailable = false;
    boundary.draft = null;
  });

  it.each(["projects", "writing"])(
    "preserves the missing %s fallback for an empty conditional slot",
    async (collection) => {
      const { status, document } = await render(
        RecordPage,
        `/content/${collection}/missing`,
        {
          collection,
          id: "missing",
        },
      );
      expect(status).toBe(404);
      const main = document.querySelector("[role=main]");
      expect(main?.textContent).toContain("Record not found");
      expect(
        [...main.querySelectorAll('a[href="/content/pages"]')].map(
          (link) => link.textContent,
        ),
      ).toContain("Back to content");
    },
  );

  it("preserves the unavailable fallback when the private reader fails", async () => {
    boundary.unavailable = true;
    const { status, document } = await render(
      RecordPage,
      "/content/writing/missing",
      {
        collection: "writing",
        id: "missing",
      },
    );
    expect(status).toBe(503);
    const main = document.querySelector("[role=main]");
    expect(main?.textContent).toContain("Record unavailable");
    expect(
      [...main.querySelectorAll('a[href="/content/pages"]')].map(
        (link) => link.textContent,
      ),
    ).toContain("Back to content");
  });

  it("retains client hydration instructions for the actual catalog and shell", async () => {
    const { status, document } = await render(
      CatalogPage,
      "/content/dev-catalog",
    );
    expect(status).toBe(200);
    expect(document.querySelector("h1")?.textContent).toBe("Review changes");
    const shell = document.querySelector(
      'astro-island[component-export="EditorialApp"]',
    );
    const catalog = shell?.querySelector(
      'astro-island[component-export="DevReviewCatalog"]',
    );
    expect(shell?.getAttribute("client")).toBe("load");
    expect(catalog?.getAttribute("client")).toBe("load");
    const scripts = [...document.scripts]
      .map((script) => script.textContent)
      .join("\n");
    expect(scripts).toContain('customElements.define("astro-island"');
    expect(scripts).toContain('window.dispatchEvent(new Event("astro:load"))');
  });
});

it("reopens a private-only project in the real Astro editor route", async () => {
  boundary.draft = {
    key: "content/public/projects/new-project.md",
    source: "---\ntitle: New project\npublic_state: hidden\n---\n",
    revision: 1,
    updatedAt: 1000,
    discardedAt: null,
    baseCommit: "a".repeat(40),
    baseFileHash: null,
  };
  const { status, document } = await render(
    RecordPage,
    "/content/projects/new-project",
    { collection: "projects", id: "new-project" },
  );
  expect(status).toBe(200);
  expect(document.title).toBe("New project | Admin");
  const shell = document.querySelector(
    'astro-island[component-export="EditorialApp"]',
  );
  const props = shell.getAttribute("props");
  expect(props).toContain('"editorRecord"');
  expect(props).toContain('"work"');
  expect(props).toContain('"new-project"');
  expect(document.querySelector("[role=main]")?.textContent).not.toContain(
    "Record not found",
  );
});
