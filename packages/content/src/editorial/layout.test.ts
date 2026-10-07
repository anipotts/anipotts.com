import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EDITORIAL_CONTENT_ROOT,
  EDITORIAL_DIRECTORIES,
  editorialRecordKind,
  editorialRecordPath,
  listEditorialSources,
  type EditorialFileSystem,
} from "./layout.js";
import { editorialRecordSchema } from "./record.js";
import { editorialRecordPath as validatedRecordPath } from "./source.js";

const missing = (path: string) =>
  Object.assign(new Error(`ENOENT: no such file or directory, ${path}`), {
    code: "ENOENT",
  });

function fakeFs(tree: Record<string, string[]>) {
  const reads: string[] = [];
  const listed: string[] = [];
  const fs: EditorialFileSystem = {
    readdirSync(path) {
      listed.push(path);
      const names = tree[path];
      if (!names) throw missing(path);
      return [...names];
    },
    readFileSync(path, encoding) {
      expect(encoding).toBe("utf8");
      reads.push(path);
      return `source of ${path}`;
    },
  };
  return { fs, reads, listed };
}

describe("editorial layout table", () => {
  it("round trips every directory, kind and path", () => {
    for (const [directory, kind] of EDITORIAL_DIRECTORIES) {
      expect(editorialRecordKind(directory)).toBe(kind);
      expect(editorialRecordPath({ kind, id: "example" })).toBe(
        `content/public/${directory}/example.md`,
      );
    }
    expect(EDITORIAL_CONTENT_ROOT).toBe("content/public");
  });

  it.each([
    "constructor",
    "__proto__",
    "toString",
    "hasOwnProperty",
    "page",
    "Pages",
    "pages/",
    "",
  ])("names no kind for %j", (directory) => {
    expect(editorialRecordKind(directory)).toBeUndefined();
  });

  it("has exactly the kinds the record schema accepts", () => {
    expect(EDITORIAL_DIRECTORIES.map(([, kind]) => kind).sort()).toEqual(
      editorialRecordSchema.options
        .map((option) => option.shape.kind.value)
        .sort(),
    );
    expect(new Set(EDITORIAL_DIRECTORIES.map(([name]) => name)).size).toBe(
      EDITORIAL_DIRECTORIES.length,
    );
  });

  it("agrees with the validating path in ./source", () => {
    for (const record of [
      { kind: "page", id: "home" },
      { kind: "work", id: "quantercise-extension" },
      { kind: "writing", id: "hello" },
    ] as const)
      expect(validatedRecordPath(record)).toBe(editorialRecordPath(record));
  });
});

describe("listEditorialSources", () => {
  const tree = {
    "/repo/content/public/pages": ["newsletter_archive.md", "home.md"],
    "/repo/content/public/projects": [
      "quantercise.md",
      "notes.txt",
      "quantercise-extension.md",
      "README",
      "draft.mdx",
      "b.md",
      "old.md.bak",
    ],
    "/repo/content/public/writing": [],
  };

  it("walks the table in order and sorts full filenames by code unit", () => {
    const { fs, listed } = fakeFs(tree);
    const files = listEditorialSources("/repo", fs);
    expect(listed).toEqual([
      "/repo/content/public/pages",
      "/repo/content/public/projects",
      "/repo/content/public/writing",
    ]);
    expect(files.map(({ kind, id }) => `${kind}:${id}`)).toEqual([
      "page:home",
      "page:newsletter_archive",
      "work:b",
      "work:quantercise-extension",
      "work:quantercise",
    ]);
  });

  it("lists every .md file, records or not, with repository paths and sources", () => {
    const { fs, reads } = fakeFs(tree);
    const files = listEditorialSources("/repo/", fs);
    expect(files[1]).toEqual({
      directory: "pages",
      kind: "page",
      id: "newsletter_archive",
      path: "content/public/pages/newsletter_archive.md",
      source: "source of /repo/content/public/pages/newsletter_archive.md",
    });
    expect(reads).toEqual(files.map(({ path }) => `/repo/${path}`));
    expect(
      editorialRecordSchema.safeParse({ kind: "page", id: files[1]!.id })
        .success,
    ).toBe(false);
  });

  it("throws when a layout directory is missing", () => {
    const { fs } = fakeFs({
      "/repo/content/public/pages": ["home.md"],
      "/repo/content/public/projects": [],
    });
    expect(() => listEditorialSources("/repo", fs)).toThrow(/ENOENT/u);
  });

  it("lists the repository's content tree", () => {
    const root = fileURLToPath(new URL("../../../../", import.meta.url));
    const files = listEditorialSources(root, { readdirSync, readFileSync });
    expect(new Set(files.map(({ kind }) => kind))).toEqual(
      new Set(EDITORIAL_DIRECTORIES.map(([, kind]) => kind)),
    );
    let total = 0;
    for (const [directory] of EDITORIAL_DIRECTORIES)
      total += readdirSync(`${root}content/public/${directory}`).filter(
        (name) => name.endsWith(".md"),
      ).length;
    expect(files).toHaveLength(total);
    for (const file of files) {
      expect(file.path).toBe(`content/public/${file.directory}/${file.id}.md`);
      expect(file.source).toBe(readFileSync(`${root}${file.path}`, "utf8"));
      const record = editorialRecordSchema.safeParse({
        kind: file.kind,
        id: file.id,
      });
      if (record.success)
        expect(editorialRecordPath(record.data)).toBe(file.path);
    }
    expect(files.map(({ path }) => path)).toContain(
      "content/public/pages/home.md",
    );
  });
});
