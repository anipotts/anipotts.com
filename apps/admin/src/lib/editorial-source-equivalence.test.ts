import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EDITORIAL_CONTENT_ROOT,
  EDITORIAL_DIRECTORIES,
} from "@anipotts/content/editorial/layout";
import * as contract from "@anipotts/content/editorial/source";
import { describe, expect, it, vi } from "vitest";
import { bundledEntries } from "../../../../scripts/content/content-d1-seed.mjs";
import { bundledEditorialSources } from "./editorial-published-base";
import {
  hiddenWritingCard,
  publicWritingSlugs,
} from "../../../www/src/lib/social-card/gate";
import type { PublishedSnapshot } from "@anipotts/content/editorial/direct-publication";

const { readInventory } = vi.hoisted(() => ({ readInventory: vi.fn() }));
vi.mock(
  "@anipotts/content/editorial/direct-publication",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("@anipotts/content/editorial/direct-publication")
    >()),
    getPublishedInventory: readInventory,
  }),
);
// The gate's version-header dependency reaches the Cloudflare runtime. Keep
// that transport outside this suite while exercising the actual gate code.
vi.mock("../../../www/src/lib/published-runtime", () => ({
  publicVersionHeaders: (version: number) => ({
    "X-Content-Version": String(version),
  }),
}));

// Vite and Astro compile glob literals, so they cannot share the node
// walker's table. This test holds both apps' source loaders to the same record
// set instead: the admin baseline glob is compiled here and every content
// collection loader base is pinned as text. Public social-card availability is
// CMS-authoritative: its bundled-source glob stays absent, and the behavioral
// checks below exercise its decisions with a synthetic active inventory.
// This suite is admin's, so a www-only diff does not run it.
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const ADMIN_GLOB = "../../../../content/public/**/*.md";
const APPS = [
  {
    name: "admin",
    url: new URL("../../", import.meta.url),
    // Collection loaders that read outside content/public on purpose.
    outside: ["content/editorial/newsletter/"],
  },
  { name: "www", url: new URL("../../../www/", import.meta.url), outside: [] },
] as const;
const wwwApp = APPS[1].url;

// The same literal as editorial-published-base.ts, from the same directory,
// so every file the admin glob sees is listed, records or not.
const adminGlobFiles = import.meta.glob("../../../../content/public/**/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

type Row = { record: unknown; source: string };
const byPath = (rows: readonly Row[]) =>
  rows
    .map(({ record, source }) => [contract.editorialRecordPath(record), source])
    .sort(([a], [b]) => (a! < b! ? -1 : a! > b! ? 1 : 0));
const repoPath = (globKey: string) => globKey.replace(/^(?:\.\.\/)+/u, "");
const globLiterals = (file: URL) =>
  [
    ...readFileSync(file, "utf8").matchAll(
      /import\.meta\.glob\(\s*"([^"]+)"/gu,
    ),
  ].map((match) => match[1]);
const globBase = (literal: string, file: URL) =>
  fileURLToPath(new URL(literal.slice(0, literal.indexOf("*")), file));
const kinds = contract.editorialRecordSchema.options.map(
  (option) => option.shape.kind.value,
);
const directories: string[] = EDITORIAL_DIRECTORIES.map(([name]) => name);
/** The layout directory a base URL names, or undefined outside it. */
function layoutDirectory(base: URL) {
  const path = fileURLToPath(base);
  const prefix = `${root}${EDITORIAL_CONTENT_ROOT}/`;
  const name = path.startsWith(prefix) ? path.slice(prefix.length, -1) : "";
  return directories.includes(name) ? name : undefined;
}
// Astro's tinyglobby skips dotfiles; the walker does not. Only the two
// pattern shapes in use are understood, so a new shape fails until this test
// learns it.
function matched(base: URL, pattern: string) {
  if (pattern === "*.md")
    return readdirSync(fileURLToPath(base))
      .filter((name) => name.endsWith(".md") && !name.startsWith("."))
      .sort();
  if (/^[\w-]+\.md$/u.test(pattern))
    return existsSync(new URL(pattern, base)) ? [pattern] : [];
  throw new Error(`unsupported glob pattern ${pattern}`);
}

describe("editorial source layout", () => {
  const walked = bundledEntries(root, contract);
  const walkedPaths = (directory: string) =>
    [
      ...walked.entries.map((entry: { path: string }) => entry.path),
      ...walked.skipped.map((entry: { path: string }) => entry.path),
    ]
      .filter((path) =>
        path.startsWith(`${EDITORIAL_CONTENT_ROOT}/${directory}/`),
      )
      .sort();

  it("finds the same records and sources with the admin glob and the node walker", () => {
    const glob = bundledEditorialSources();
    expect(glob.length).toBeGreaterThan(0);
    expect(byPath(glob)).toEqual(byPath(walked.entries));
    for (const entry of walked.entries)
      expect(entry.path).toBe(contract.editorialRecordPath(entry.record));
  });

  it("lists every glob file once, as a record or as a skipped source", () => {
    const listed = [
      ...walked.entries.map((entry: { path: string }) => entry.path),
      ...walked.skipped.map((entry: { path: string }) => entry.path),
    ].sort();
    expect(listed).toEqual(Object.keys(adminGlobFiles).map(repoPath).sort());
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("skips only files no valid record identity names", () => {
    for (const { path, reason } of walked.skipped) {
      expect(reason).toBe("not_an_editorial_record");
      const id = path.slice(path.lastIndexOf("/") + 1, -".md".length);
      for (const kind of kinds) {
        let named: string | undefined;
        try {
          named = contract.editorialRecordPath({ kind, id });
        } catch {
          named = undefined;
        }
        expect(named).not.toBe(path);
      }
    }
  });

  it("pins the admin baseline glob literal to content/public, recursively", () => {
    const file = new URL("./editorial-published-base.ts", import.meta.url);
    expect(globLiterals(file)).toEqual([ADMIN_GLOB]);
    expect(globBase(ADMIN_GLOB, file)).toBe(`${root}content/public/`);
  });

  it("keeps www social-card availability in the active CMS inventory", () => {
    const file = new URL("src/lib/social-card/gate.ts", wwwApp);
    const text = readFileSync(file, "utf8");
    expect(globLiterals(file)).toEqual([]);
    expect(text).toContain("await getPublishedInventory(db)");
    expect(text).toContain("publicWritingSlugs(publications).has(slug)");
    expect(text).not.toContain("bundledWritingSources");
  });

  for (const app of APPS)
    it(`pins every ${app.name} collection loader base to a layout directory`, () => {
      const text = readFileSync(
        new URL("src/content.config.ts", app.url),
        "utf8",
      );
      const loaders = [
        ...text.matchAll(
          /glob\(\s*\{\s*pattern:\s*"([^"]+)",\s*base:\s*"([^"]+)",?\s*\}\s*\)/gu,
        ),
      ].map(([, pattern, base]) => ({ pattern: pattern!, base: base! }));
      // A loader this pattern cannot read fails here instead of going unchecked.
      expect(loaders.length).toBe(text.match(/\bglob\(/gu)?.length ?? 0);
      expect(loaders.length).toBeGreaterThan(0);
      const read = new Set<string>();
      const outside: string[] = [];
      for (const { pattern, base } of loaders) {
        // Astro resolves a loader base against the project root, not the file.
        const url = new URL(base.endsWith("/") ? base : `${base}/`, app.url);
        const directory = layoutDirectory(url);
        if (!directory) {
          outside.push(fileURLToPath(url).slice(root.length));
          continue;
        }
        read.add(directory);
        const paths = matched(url, pattern).map(
          (name) => `${EDITORIAL_CONTENT_ROOT}/${directory}/${name}`,
        );
        expect(paths.length, `${base}/${pattern}`).toBeGreaterThan(0);
        if (pattern === "*.md") expect(paths).toEqual(walkedPaths(directory));
        else
          for (const path of paths)
            expect(walkedPaths(directory)).toContain(path);
      }
      expect(outside).toEqual(app.outside);
      expect([...read].sort()).toEqual([...directories].sort());
    });
});

function publishedWriting(
  source: string,
  id = "synthetic-article",
): PublishedSnapshot {
  return {
    contentSchemaVersion: 1,
    publicationId: "synthetic-publication",
    record: { kind: "writing", id },
    source,
    revision: 1,
    sourceSha256: "0".repeat(64),
    publishedAt: "2026-10-01T00:00:00.000Z",
  };
}

const writingSource = (status: string, slug = "cms-article") =>
  `---\ntitle: Synthetic article\nsummary: Synthetic summary\nslug: ${slug}\nstatus: ${status}\npublished_at: 2026-10-01\nscheduled_at: 2026-10-02\n---\nSynthetic body.\n`;

describe("CMS-authoritative writing social cards", () => {
  it("cannot resurrect bundled writing when the active CMS inventory is empty", async () => {
    const writing = bundledEditorialSources().find(
      (entry) => entry.record.kind === "writing",
    );
    expect(writing).toBeDefined();
    const data = contract.parseEditorialSource(writing!.source).data as {
      slug?: unknown;
    };
    const slug = String(data.slug ?? writing!.record.id);
    const database = {} as Parameters<typeof hiddenWritingCard>[0];
    readInventory.mockResolvedValueOnce({ version: 7, publications: [] });
    const response = await hiddenWritingCard(database, slug);
    expect(response?.status).toBe(404);
    expect(response?.headers.get("X-Content-Version")).toBe("7");
    expect(readInventory).toHaveBeenLastCalledWith(database);
  });

  it("takes the route slug from the active CMS source, without retaining the old route", () => {
    const publication = publishedWriting(
      writingSource("published", "new-cms-route"),
      "old-route",
    );
    expect([...publicWritingSlugs([publication])]).toEqual(["new-cms-route"]);
    expect(publicWritingSlugs([publication]).has("old-route")).toBe(false);
  });

  it.each(["draft", "scheduled"])(
    "does not serve cards for %s CMS writing",
    async (status) => {
      const database = {} as Parameters<typeof hiddenWritingCard>[0];
      const publications = [publishedWriting(writingSource(status))];
      readInventory.mockResolvedValueOnce({ version: 8, publications });
      expect(publicWritingSlugs(publications).size).toBe(0);
      expect((await hiddenWritingCard(database, "cms-article"))?.status).toBe(
        404,
      );
    },
  );

  it("admits a card only when valid published writing is present in the active inventory", async () => {
    const database = {} as Parameters<typeof hiddenWritingCard>[0];
    readInventory.mockResolvedValueOnce({
      version: 9,
      publications: [publishedWriting(writingSource("published"))],
    });
    expect(await hiddenWritingCard(database, "cms-article")).toBeNull();
  });

  it("ignores malformed writing and non-writing records", () => {
    const malformed = publishedWriting(
      "---\nstatus: published\n---\nMissing required metadata.\n",
    );
    const work: PublishedSnapshot = {
      ...publishedWriting(writingSource("published")),
      record: { kind: "work", id: "synthetic-work" },
    };
    expect(publicWritingSlugs([malformed, work]).size).toBe(0);
  });
});
