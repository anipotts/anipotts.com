import { describe, expect, it, vi } from "vitest";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import reactRenderer from "@astrojs/react/server.js";
import { ADMIN_ROUTES } from "../../../../scripts/ci/admin-route-inventory.mjs";
import { contentDatabase } from "../../../www/test/content-database.mjs";
import { env as workerEnv } from "cloudflare:workers";

// Production renders every Admin page on the server. A browser global touched
// during that render throws after the response has started, which ships an
// empty 200 body. This renders each inventoried page route, and the public
// sign-in page, with the Data and ops readers on and the production (no
// fixture) branch, and checks that the whole document arrives. Only data
// boundaries are synthetic: Git content is read from the repository.

const content = vi.hoisted(() => {
  const { readdirSync, readFileSync } = require("node:fs");
  const root = new URL("../../../../content/", import.meta.url);
  /** Git records, as the glob loaders read them, keyed by collection. */
  const sources = {
    writing: "public/writing",
    projects: "public/projects",
    newsletterDrafts: "editorial/newsletter",
    home: "public/pages/home.md",
  };
  const read = (path) => readFileSync(new URL(path, root), "utf8");
  const files = (collection) => {
    const path = sources[collection];
    if (!path) return [];
    if (path.endsWith(".md")) return [[path.split("/").pop(), read(path)]];
    return readdirSync(new URL(`${path}/`, root))
      .filter((name) => name.endsWith(".md"))
      .map((name) => [name, read(`${path}/${name}`)]);
  };
  return { files, read };
});

vi.mock("astro:content", async () => {
  const { parseEditorialSource } =
    await import("@anipotts/content/editorial/source");
  const { projectSchema, writingSchema } =
    await import("@anipotts/content/public/schema");
  const { homepageSchema } = await import("@anipotts/content/public/pages");
  const { newsletterDraftSchema } =
    await import("@anipotts/content/newsletter-draft");
  const { createComponent, render, unescapeHTML } =
    await import("astro/runtime/server/index.js");
  const schemas = {
    writing: writingSchema,
    projects: projectSchema,
    newsletterDrafts: newsletterDraftSchema,
    home: homepageSchema,
  };
  const getCollection = async (collection) =>
    content.files(collection).map(([name, source]) => {
      const parsed = parseEditorialSource(source);
      return {
        id: name.replace(/\.md$/, ""),
        collection,
        body: parsed.body.trim(),
        data: schemas[collection].parse(parsed.data),
      };
    });
  return {
    getCollection,
    getEntry: async (collection, id) =>
      (await getCollection(collection)).find((entry) => entry.id === id),
    render: async (entry) => ({
      Content: createComponent(
        () => render`${unescapeHTML(entry.rendered?.html ?? "")}`,
      ),
      headings: [],
      remarkPluginFrontmatter: {},
    }),
  };
});

// The admin editorial inventory, from the same Git records.
vi.mock("../../src/lib/editorial-content", async () => {
  const { getCollection } = await import("astro:content");
  return {
    publicSiteUrl: "https://anipotts.com",
    recordUpdate: () => undefined,
    editorialInventory: async () => ({
      projects: await getCollection("projects"),
      writing: await getCollection("writing"),
      pages: await getCollection("home"),
    }),
  };
});
vi.mock("../../src/lib/editorial-inventory-server", () => ({
  inventoryFixture: () => undefined,
  loadEditorialInventory: async () => ({
    records: [],
    groups: [],
    searchEntries: [],
    unavailable: false,
  }),
}));
// Draft storage holds the current Git source at revision 1, so the preview
// routes render their success path instead of the stale refusal. It is the
// EDITORIAL Durable Object binding productionEditor reads, in dev and deploy.
const draftStorage = {
  get: async ({ kind, id }) => {
    const path = {
      "page:home": "public/pages/home.md",
      "writing:search-will-be-dead-by-2030":
        "public/writing/search-will-be-dead-by-2030.md",
    }[`${kind}:${id}`];
    return path
      ? { source: content.read(path), revision: 1, discardedAt: null }
      : null;
  },
};
// The production loader: no development fixtures, so the readers' own
// states render, as they do in the deployed Worker.
vi.mock("../../src/lib/shell-fixtures", () => ({
  loadShellFixtures: async () => undefined,
}));

/** An empty D1: every read succeeds with no rows. */
const emptyStatement = {
  bind: () => emptyStatement,
  all: async () => ({ success: true, results: [] }),
  first: async () => null,
  raw: async () => [],
  run: async () => ({ success: true, results: [] }),
};
const emptyDatabase = {
  prepare: () => emptyStatement,
  batch: async (statements) => statements.map(() => ({ results: [] })),
};
const READERS_ON = {
  PRIVATE_READER_ENABLED: "true",
  PRIVATE_READER_OPS_ENABLED: "true",
  EDITORIAL_ENABLED: "true",
  EDITORIAL_PUBLISH_ENABLED: "true",
  DB: emptyDatabase,
  // The published store at version 0: previews overlay nothing on Git.
  CONTENT_DB: contentDatabase(),
  EDITORIAL: { getByName: () => draftStorage },
};
// Every route reads these bindings, as a Worker reads its own.
Object.assign(workerEnv, READERS_ON);

const pageModules = {
  ...import.meta.glob("../../src/pages/**/*.astro"),
  ...import.meta.glob("../../src/dev/*.astro"),
};
const moduleFor = (file) =>
  pageModules[file.replace(/^apps\/admin\/src\//, "../../src/")];

/** The route params Astro would pass for `route` served by `file`. */
function paramsFor(file, route) {
  const pattern = file
    .replace(/^apps\/admin\/src\/(?:pages|dev)/, "")
    .replace(/(?:\/index)?\.astro$/, "")
    .split("/")
    .filter(Boolean);
  const segments = route.split("/").filter(Boolean);
  const params = {};
  pattern.forEach((part, index) => {
    const rest = part.match(/^\[\.\.\.(\w+)\]$/);
    if (rest) params[rest[1]] = segments.slice(index).join("/");
    else if (/^\[\w+\]$/.test(part))
      params[part.slice(1, -1)] = segments[index];
  });
  return params;
}

// A preview request names the exact draft revision it shows.
const QUERY = {
  "/preview/home": "?revision=1",
  "/preview/record": "?kind=writing&id=search-will-be-dead-by-2030&revision=1",
};
const pages = [
  ...ADMIN_ROUTES.filter(({ route }) => !route.startsWith("/api/")),
  { route: "/auth", file: "apps/admin/src/pages/auth.astro" },
].map(({ route, file }) => ({
  route,
  file,
  url: route + (QUERY[route] ?? ""),
}));

async function render({ file, route, url }) {
  const container = await AstroContainer.create();
  container.addServerRenderer({
    name: "@astrojs/react",
    renderer: reactRenderer,
  });
  container.addClientRenderer({
    name: "@astrojs/react",
    entrypoint: "@astrojs/react/client.js",
  });
  const page = await moduleFor(file)();
  return container.renderToResponse(page.default, {
    request: new Request(`https://admin.anipotts.com${url}`),
    params: paramsFor(file, route),
    locals: {},
    partial: false,
  });
}

describe("every Admin page server-renders with the readers on", () => {
  it("finds a page module for every inventoried page route", () => {
    for (const { file } of pages) expect(moduleFor(file), file).toBeDefined();
  });

  it.each(pages)("$url", async (page) => {
    const response = await render(page);
    if (response.status === 308) {
      // A retired route answers with its new home and has no body to lose.
      expect(response.headers.get("location")).toMatch(/^\/[^/]/);
      return;
    }
    const html = await response.text();
    expect(response.status, html.slice(0, 400)).toBe(
      page.route === "/404" ? 404 : 200,
    );
    // The whole document arrived. Previews append their frame script.
    expect(html).toMatch(/<body[\s>]/);
    expect(html).toContain("</html>");
    expect(html.length).toBeGreaterThan(1000);
    // The reader pages took the readers-on branch.
    if (/^\/(?:$|data\/|observability\/)/.test(page.route))
      expect(html).toContain("&quot;enabled&quot;:[0,true]");
  });
});
