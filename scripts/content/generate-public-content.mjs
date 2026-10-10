#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { format } from "prettier";
import { parse } from "yaml";
import { listEditorialSources } from "../../packages/content/src/editorial/layout.ts";
import { isPublishedWriting } from "../../packages/content/src/public/visibility.ts";
import {
  projectSchema,
  publicSlugSchema,
  writingSchema,
} from "../../packages/content/src/public/schema.ts";

const rootArgument = process.argv.indexOf("--root");
const ROOT =
  rootArgument < 0 ? process.cwd() : resolve(process.argv[rootArgument + 1]);
const GENERATED_TS = join(ROOT, "packages/content/src/public/generated.ts");
const CHECK = process.argv.includes("--check");

// Page defaults are typed by the zod schemas in packages/content/src/public/pages.ts.
const pageExports = {
  home: ["DEFAULT_HOMEPAGE_CONTENT", "Homepage"],
  work: ["DEFAULT_WORK_INDEX_CONTENT", "WorkPage"],
  writing: ["DEFAULT_WRITING_INDEX_CONTENT", "ListingPage"],
  newsletter: ["DEFAULT_NEWSLETTER_CONTENT", "NewsletterPage"],
  newsletter_archive: ["DEFAULT_NEWSLETTER_ARCHIVE_CONTENT", "ListingPage"],
  systems: ["DEFAULT_SYSTEMS_CONTENT", "SystemsPage"],
};

// One walk of content/public, in layout order. A missing directory lists as
// empty here; the canonical page check below still fails closed.
const sourceFiles = listEditorialSources(ROOT, {
  readdirSync: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
  readFileSync,
});
const markdownFiles = (kind) =>
  sourceFiles
    .filter((entry) => entry.kind === kind)
    .map((entry) => join(ROOT, entry.path));

const projects = markdownFiles("work").map(projectRecord);
const writing = markdownFiles("writing").map(writingRecord);
for (const [surface, entries] of Object.entries({ projects, writing })) {
  const slugs = new Set();
  for (const entry of entries) {
    publicSlugSchema.parse(entry.slug);
    if (slugs.has(entry.slug))
      throw new Error(`duplicate ${surface} slug: ${entry.slug}`);
    slugs.add(entry.slug);
    if (surface === "projects" && entry.detail_path !== `/work/${entry.slug}`) {
      throw new Error(`project detail_path must match slug: ${entry.slug}`);
    }
  }
}
const pages = Object.fromEntries(
  markdownFiles("page").map((file) => {
    const key = basename(file, ".md");
    const { frontmatter } = parseMarkdown(file);
    if (!pageExports[key]) throw new Error(`unknown public page: ${key}`);
    return [key, frontmatter];
  }),
);

for (const key of Object.keys(pageExports)) {
  if (!pages[key]) throw new Error(`missing canonical public page: ${key}`);
}

const sourceManifest = Object.fromEntries(
  sourceFiles.map(({ path }) => [path, sha256(readFileSync(join(ROOT, path)))]),
);
const sourceHash = sha256(
  JSON.stringify(
    Object.entries(sourceManifest).sort(([a], [b]) => a.localeCompare(b)),
  ),
);

const outputs = new Map([
  [
    GENERATED_TS,
    await format(generatedTypescript(pages, projects, writing, sourceHash), {
      parser: "typescript",
    }),
  ],
]);

let drift = false;
for (const [file, value] of outputs) {
  if (CHECK) {
    if (!existsSync(file) || readFileSync(file, "utf8") !== value) {
      console.error(`generated public content is stale: ${sourceRef(file)}`);
      drift = true;
    }
    continue;
  }
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, value);
  console.log(`wrote ${sourceRef(file)}`);
}

if (drift) process.exitCode = 1;

function parseMarkdown(file) {
  const raw = readFileSync(file, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`missing YAML frontmatter: ${sourceRef(file)}`);
  return { frontmatter: parse(match[1]) ?? {}, body: match[2].trim() };
}

function projectRecord(file) {
  const { frontmatter: raw, body } = parseMarkdown(file);
  const frontmatter = projectSchema.parse(raw);
  const slug = frontmatter.slug ?? basename(file, ".md");
  return {
    slug,
    title: String(frontmatter.title ?? slug),
    status: String(frontmatter.status ?? "wip"),
    year: String(frontmatter.year ?? ""),
    range: String(frontmatter.duration ?? ""),
    tags: strings(frontmatter.tags).map((tag) => tag.toLowerCase()),
    summary: String(frontmatter.subtitle ?? frontmatter.description ?? ""),
    body: body || String(frontmatter.description ?? ""),
    links: [
      frontmatter.link_live
        ? { label: "live site", url: String(frontmatter.link_live) }
        : null,
      frontmatter.link_repo
        ? { label: "source", url: String(frontmatter.link_repo) }
        : null,
    ].filter(Boolean),
    order: Number(frontmatter.sort_order ?? 0),
    kind: String(frontmatter.kind),
    public_state: String(frontmatter.public_state),
    homepage_placement: String(frontmatter.homepage_placement),
    catalog_group: String(frontmatter.catalog_group),
    homepage_order: Number(frontmatter.homepage_order ?? 0),
    card_copy: String(frontmatter.card_copy),
    detail_path: String(frontmatter.detail_path),
    identity: frontmatter.identity ?? {},
    preview_media: frontmatter.preview_media ?? null,
    story: Array.isArray(frontmatter.story) ? frontmatter.story : [],
  };
}

function writingRecord(file) {
  const { frontmatter: raw, body } = parseMarkdown(file);
  const frontmatter = writingSchema.parse(raw);
  const slug = frontmatter.slug ?? basename(file, ".md");
  const date = isoDate(frontmatter.published_at);
  return {
    slug,
    title: String(frontmatter.title ?? slug),
    date,
    tags: strings(frontmatter.tags).map((tag) => tag.toLowerCase()),
    preview: String(frontmatter.summary ?? ""),
    body,
    sourceLinks: frontmatter.artifact_url
      ? [
          {
            label: String(
              frontmatter.artifact_label ??
                frontmatter.artifact_type ??
                "source",
            ),
            url: String(frontmatter.artifact_url),
          },
        ]
      : [],
    visible: isPublishedWriting(frontmatter),
    order: Number(date.replaceAll("-", "")) || 0,
  };
}

function generatedTypescript(pages, projects, writing, hash) {
  const exports = Object.entries(pageExports)
    .map(([key, [name, type]]) => typedExport(name, pages[key], type))
    .join("\n\n");
  // Whole-statement `import type` lines: node type stripping loads generated.ts
  // directly (scripts/ci/public-route-inventory.mjs) and erases them entirely.
  return `/* generated by scripts/content/generate-public-content.mjs */\nimport type { Homepage, ListingPage, NewsletterPage, SystemsPage, WorkPage } from "./pages.js";\nimport type { ProjectProjection, WritingProjection } from "./projections.js";\n\nexport const PUBLIC_CONTENT_SOURCE_HASH = ${JSON.stringify(hash)};\n\n${exports}\n\nexport const HOME_SECTION_ORDER: Homepage["section_order"] = DEFAULT_HOMEPAGE_CONTENT.section_order;\n\n${typedExport("DEFAULT_CMS_PROJECTS", projects, "ProjectProjection[]")}\n\n${typedExport("DEFAULT_CMS_WRITING", writing, "WritingProjection[]")}\n`;
}

function typedExport(name, value, type) {
  return `export const ${name}: ${type} = ${JSON.stringify(value, null, 2)};`;
}

function strings(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function isoDate(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceRef(file) {
  return relative(ROOT, file).replaceAll("\\", "/");
}
