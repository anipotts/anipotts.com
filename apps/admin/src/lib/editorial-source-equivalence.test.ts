import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EDITORIAL_CONTENT_ROOT,
  EDITORIAL_DIRECTORIES,
} from "@anipotts/content/editorial/layout";
import * as contract from "@anipotts/content/editorial/source";
import { describe, expect, it } from "vitest";
import { bundledEntries } from "../../../../scripts/content/content-d1-seed.mjs";
import { bundledEditorialSources } from "./editorial-published-base";

// Vite and Astro compile glob literals, so they cannot share the node
// walker's table. This test holds both apps' literals to the same record set
// instead: the admin baseline glob is compiled here, and the www social-card
// glob and every content collection loader base are pinned as text. The www
// glob's module reaches cloudflare:workers and cannot load under this runner.
// This suite is admin's, so a www-only diff does not run it.
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const ADMIN_GLOB = "../../../../content/public/**/*.md";
const WWW_GLOB = "../../../../../content/public/writing/*.md";
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

  it("pins the www social-card glob literal to the walker's writing directory", () => {
    const file = new URL("src/lib/social-card/gate.ts", wwwApp);
    expect(globLiterals(file)).toEqual([WWW_GLOB]);
    const cut = WWW_GLOB.lastIndexOf("/") + 1;
    const base = new URL(WWW_GLOB.slice(0, cut), file);
    expect(layoutDirectory(base)).toBe("writing");
    expect(
      matched(base, WWW_GLOB.slice(cut)).map(
        (name) => `${EDITORIAL_CONTENT_ROOT}/writing/${name}`,
      ),
    ).toEqual(walkedPaths("writing"));
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
