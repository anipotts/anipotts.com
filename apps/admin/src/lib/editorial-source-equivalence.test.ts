import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as contract from "@anipotts/content/editorial/source";
import { describe, expect, it } from "vitest";
import { bundledEntries } from "../../../../scripts/content/content-d1-seed.mjs";
import { bundledEditorialSources } from "./editorial-published-base";

// Vite compiles glob literals, so they cannot share the node walker's table.
// This test holds them to the same record set instead: the admin baseline glob
// is compiled here, and the www social-card glob is pinned as text because its
// module reaches cloudflare:workers and cannot load under this runner.
const root = fileURLToPath(new URL("../../../../", import.meta.url));
const ADMIN_GLOB = "../../../../content/public/**/*.md";
const WWW_GLOB = "../../../../../content/public/writing/*.md";

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

describe("editorial source layout", () => {
  const walked = bundledEntries(root, contract);

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
    const file = new URL(
      "../../../www/src/lib/social-card/gate.ts",
      import.meta.url,
    );
    expect(globLiterals(file)).toEqual([WWW_GLOB]);
    const base = globBase(WWW_GLOB, file);
    expect(base).toBe(`${root}content/public/writing/`);
    const files = readdirSync(base)
      .filter((name) => name.endsWith(".md") && !name.startsWith("."))
      .map((name) => `content/public/writing/${name}`)
      .sort();
    const walkedWriting = [
      ...walked.entries.map((entry: { path: string }) => entry.path),
      ...walked.skipped.map((entry: { path: string }) => entry.path),
    ]
      .filter((path) => path.startsWith("content/public/writing/"))
      .sort();
    expect(walkedWriting).toEqual(files);
  });
});
