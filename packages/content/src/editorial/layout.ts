/** Where editorial sources live under content/public, and which record kind
 * each directory holds. This is the one copy of that table: the public
 * content generator and the D1 seed walk with it, ./source derives record
 * paths from it, and admin maps its baseline glob paths through it.
 *
 * Keep this module import-free and erasable TypeScript only (no enum,
 * namespace or parameter properties): node loads it directly, with type
 * stripping, from scripts/content/*.mjs before any package build. Vite glob
 * literals and Astro collection loader bases cannot import it, so
 * apps/admin/src/lib/editorial-source-equivalence.test.ts and the public app's
 * editorial-source-layout.test.mjs hold source-loader literals to it. Public social-card availability reads only
 * the CMS inventory, separately from these build-time source loaders. */

export const EDITORIAL_CONTENT_ROOT = "content/public";

/** Directory and record kind pairs, in walk order. */
export const EDITORIAL_DIRECTORIES = [
  ["pages", "page"],
  ["projects", "work"],
  ["writing", "writing"],
] as const;

export type EditorialDirectory = (typeof EDITORIAL_DIRECTORIES)[number][0];
export type EditorialRecordKind = (typeof EDITORIAL_DIRECTORIES)[number][1];

/** The record kind a content/public directory holds, or undefined. */
export function editorialRecordKind(
  directory: string,
): EditorialRecordKind | undefined {
  for (const [name, kind] of EDITORIAL_DIRECTORIES)
    if (name === directory) return kind;
  return undefined;
}

/** The repository path for a record identity. It does not validate the id:
 * pass an identity editorialRecordSchema already parsed, or use
 * editorialRecordPath from ./source, which parses unknown input first. */
export function editorialRecordPath(record: {
  readonly kind: EditorialRecordKind;
  readonly id: string;
}): string {
  for (const [directory, kind] of EDITORIAL_DIRECTORIES)
    if (kind === record.kind)
      return `${EDITORIAL_CONTENT_ROOT}/${directory}/${record.id}.md`;
  throw new Error("unknown_editorial_kind");
}

/** The two node:fs calls the walk needs, so tests and scripts can adapt them. */
export type EditorialFileSystem = {
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: "utf8"): string;
};

export type EditorialSourceFile = {
  directory: EditorialDirectory;
  kind: EditorialRecordKind;
  /** The filename without .md, not validated as a record id. */
  id: string;
  /** Repository-relative, for example content/public/pages/home.md. */
  path: string;
  source: string;
};

/** Every .md file directly inside each layout directory, in table order, then
 * by full filename in code-unit order (quantercise-extension.md sorts before
 * quantercise.md). Ids are not validated, so retained non-record sources
 * such as pages/newsletter_archive.md are listed too; callers validate
 * identities with editorialRecordSchema. A missing directory throws from
 * fs.readdirSync unless the adapter decides otherwise. */
export function listEditorialSources(
  root: string,
  fs: EditorialFileSystem,
): EditorialSourceFile[] {
  // Trim trailing slashes in one linear pass. A /\/+$/ replace is quadratic
  // on long runs of slashes (CodeQL js/polynomial-redos).
  let end = root.length;
  while (end > 0 && root[end - 1] === "/") end -= 1;
  const base = root.slice(0, end);
  const files: EditorialSourceFile[] = [];
  for (const [directory, kind] of EDITORIAL_DIRECTORIES) {
    const names = fs
      .readdirSync(`${base}/${EDITORIAL_CONTENT_ROOT}/${directory}`)
      .filter((name) => name.endsWith(".md"))
      .sort();
    for (const name of names) {
      const path = `${EDITORIAL_CONTENT_ROOT}/${directory}/${name}`;
      files.push({
        directory,
        kind,
        id: name.slice(0, -".md".length),
        path,
        source: fs.readFileSync(`${base}/${path}`, "utf8"),
      });
    }
  }
  return files;
}
