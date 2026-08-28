#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative } from "node:path";
import { format } from "prettier";
import { parse, stringify } from "yaml";

const ROOT = process.cwd();
const SOURCE_ROOT = join(ROOT, "content/public");
const PROJECTS_ROOT = join(SOURCE_ROOT, "projects");
const WRITING_ROOT = join(SOURCE_ROOT, "writing");
const PAGES_ROOT = join(SOURCE_ROOT, "pages");
const GENERATED_TS = join(ROOT, "packages/content/src/public/generated.ts");
const VALIDATION_JSON = join(
  ROOT,
  "packages/content/generated/public-content.json",
);
const ADMIN_JSON = join(
  ROOT,
  "packages/content/generated/admin-public-content.json",
);
const D1_JSON = join(ROOT, "drizzle/seeds/public-content.json");
const CHECK = process.argv.includes("--check");
const BOOTSTRAP = process.argv.includes("--bootstrap-pages");

const pageExports = {
  home: ["DEFAULT_HOMEPAGE_CONTENT", "HomepageContent"],
  making: ["DEFAULT_MAKING_INDEX_CONTENT", "ListingPageContent"],
  projects: ["DEFAULT_PROJECTS_INDEX_CONTENT", "ListingPageContent"],
  writing: ["DEFAULT_WRITING_INDEX_CONTENT", "ListingPageContent"],
  newsletter: ["DEFAULT_NEWSLETTER_CONTENT", "NewsletterContent"],
  newsletter_archive: [
    "DEFAULT_NEWSLETTER_ARCHIVE_CONTENT",
    "ListingPageContent",
  ],
  orchestrating: ["DEFAULT_ORCHESTRATING_CONTENT", "OrchestratingPageContent"],
  systems: ["DEFAULT_SYSTEMS_CONTENT", "SystemsPageContent"],
};

if (BOOTSTRAP) {
  await bootstrapPages();
}

const projectEntries = markdownFiles(PROJECTS_ROOT).map((file) => ({
  content: projectRecord(file),
  source: sourceRef(file),
  source_record: sourceContentRecord("projects", file),
}));
const writingEntries = markdownFiles(WRITING_ROOT).map((file) => ({
  content: writingRecord(file),
  source: sourceRef(file),
  source_record: sourceContentRecord("writing", file),
}));
const projects = projectEntries.map(({ content }) => content);
const writing = writingEntries.map(({ content }) => content);
const pages = Object.fromEntries(
  markdownFiles(PAGES_ROOT).map((file) => {
    const key = basename(file, ".md");
    const { frontmatter } = parseMarkdown(file);
    if (!pageExports[key]) throw new Error(`unknown public page: ${key}`);
    return [key, frontmatter];
  }),
);

for (const key of Object.keys(pageExports)) {
  if (!pages[key]) throw new Error(`missing canonical public page: ${key}`);
}

const sourceFiles = [
  ...markdownFiles(PAGES_ROOT),
  ...markdownFiles(PROJECTS_ROOT),
  ...markdownFiles(WRITING_ROOT),
];
const sourceManifest = Object.fromEntries(
  sourceFiles.map((file) => [sourceRef(file), sha256(readFileSync(file))]),
);
const sourceHash = sha256(
  JSON.stringify(
    Object.entries(sourceManifest).sort(([a], [b]) => a.localeCompare(b)),
  ),
);

const canonical = {
  schema_version: 1,
  source_root: "content/public",
  source_hash: sourceHash,
  sources: sourceManifest,
  pages,
  projects,
  writing,
};

const adminProjection = {
  schema_version: 1,
  source_hash: sourceHash,
  source_records: [
    ...projectEntries.map(({ source_record }) => source_record),
    ...writingEntries.map(({ source_record }) => source_record),
  ].sort(compareSourceRecords),
  records: [
    ...Object.entries(pages).map(([key, content]) => ({
      entity_id: `public-page:${key}`,
      kind: "page",
      title: content.title ?? content.headline ?? key.replaceAll("_", " "),
      status: "source_controlled",
      route: pageRoute(key),
      source_ref: `content/public/pages/${key}.md`,
      source_hash: sourceManifest[`content/public/pages/${key}.md`],
    })),
    ...projectEntries.map(({ content, source }) =>
      projectionRecord("project", content, source),
    ),
    ...writingEntries.map(({ content, source }) =>
      projectionRecord("writing", content, source),
    ),
  ],
};

const d1Seeds = {
  schema_version: 1,
  source_hash: sourceHash,
  policy: "future_additive_seed_input_only",
  rows: [
    ...Object.entries(pages).map(([key, content]) =>
      seedRow(key, content, true, `content/public/pages/${key}.md`),
    ),
    ...projectEntries.map(({ content, source }) =>
      seedRow(
        `project:${content.slug}`,
        content,
        content.public_state !== "hidden",
        source,
      ),
    ),
    ...writingEntries.map(({ content, source }) =>
      seedRow(`writing:${content.slug}`, content, content.visible, source),
    ),
  ],
};

const outputs = new Map([
  [
    GENERATED_TS,
    await format(generatedTypescript(pages, projects, writing, sourceHash), {
      parser: "typescript",
    }),
  ],
  [VALIDATION_JSON, await formatJson(canonical)],
  [ADMIN_JSON, await formatJson(adminProjection)],
  [D1_JSON, await formatJson(d1Seeds)],
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

async function formatJson(value) {
  return format(JSON.stringify(value), { parser: "json" });
}

async function bootstrapPages() {
  const defaults = await import(
    new URL("../../packages/content/dist/public/defaults.js", import.meta.url)
  );
  mkdirSync(PAGES_ROOT, { recursive: true });
  for (const [key, [exportName]] of Object.entries(pageExports)) {
    const value = defaults[exportName];
    if (!value) throw new Error(`missing bootstrap export: ${exportName}`);
    writeFileSync(
      join(PAGES_ROOT, `${key}.md`),
      `---\n${stringify(value, { lineWidth: 0 }).trimEnd()}\n---\n`,
    );
  }
}

function markdownFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .map((file) => join(dir, file));
}

function parseMarkdown(file) {
  const raw = readFileSync(file, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error(`missing YAML frontmatter: ${sourceRef(file)}`);
  return { frontmatter: parse(match[1]) ?? {}, body: match[2].trim() };
}

function projectRecord(file) {
  const { frontmatter, body } = parseMarkdown(file);
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
  const { frontmatter, body } = parseMarkdown(file);
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
    visible: String(frontmatter.status ?? "draft") === "published",
    order: Number(date.replaceAll("-", "")) || 0,
  };
}

function sourceContentRecord(surface, file) {
  const { frontmatter, body } = parseMarkdown(file);
  const slug = String(frontmatter.slug ?? basename(file, ".md"));
  const status =
    surface === "writing"
      ? String(frontmatter.status ?? "draft")
      : frontmatter.public_state === "hidden"
        ? "hidden"
        : String(frontmatter.status ?? "unknown");

  return {
    id: `${surface}.${slug}`,
    surface,
    slug,
    title: String(frontmatter.title ?? slug),
    route: `/${surface}/${slug}`,
    status,
    source_ref: sourceRef(file),
    summary: String(
      frontmatter.summary ??
        frontmatter.subtitle ??
        frontmatter.description ??
        "no summary field",
    ),
    body_words: countWords(body),
    body_state: bodyState(surface, body),
    body_section_count: body
      .split("\n")
      .filter((line) => /^#{2,6}\s+\S/.test(line.trim())).length,
    body_preview: markdownPreview(body),
    fields: Object.entries(frontmatter).map(([path, value]) => ({
      path,
      value: formatFieldValue(value),
      kind: fieldKind(value),
    })),
    next_safe_action:
      surface === "projects"
        ? "review project frontmatter, detail body, and structured sections before modeling a draft operation"
        : "review title, summary, tags, and body before newsletter backfill",
  };
}

function compareSourceRecords(a, b) {
  if (a.surface !== b.surface) return a.surface.localeCompare(b.surface);
  if (a.surface === "projects") {
    const aOrder = Number(
      a.fields.find((field) => field.path === "sort_order")?.value ?? 0,
    );
    const bOrder = Number(
      b.fields.find((field) => field.path === "sort_order")?.value ?? 0,
    );
    return bOrder - aOrder || a.title.localeCompare(b.title);
  }
  return b.source_ref.localeCompare(a.source_ref);
}

function countWords(body) {
  return body.trim().split(/\s+/).filter(Boolean).length;
}

function bodyState(surface, body) {
  const words = countWords(body);
  if (words === 0 && surface === "projects") return "frontmatter only";
  if (words === 0) return "empty body";
  if (words < 80) return "short body";
  return "body ready for preview";
}

function markdownPreview(body) {
  const normalized = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ");
  if (!normalized) return "no markdown body yet";
  return normalized.length > 220
    ? `${normalized.slice(0, 217).trimEnd()}...`
    : normalized;
}

function formatFieldValue(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    return value.length > 96 ? `${value.slice(0, 93)}...` : value;
  }
  return JSON.stringify(value) ?? String(value);
}

function fieldKind(value) {
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function projectionRecord(kind, content, source) {
  return {
    entity_id: `public-${kind}:${content.slug}`,
    kind,
    title: content.title,
    status:
      kind === "project"
        ? content.status
        : content.visible
          ? "published"
          : "draft",
    route: `/${kind === "project" ? "projects" : "writing"}/${content.slug}`,
    source_ref: source,
    source_hash: sourceManifest[source],
  };
}

function seedRow(pageKey, content, published, source) {
  return {
    page_key: pageKey,
    published,
    content,
    source_ref: source,
    source_hash: sourceManifest[source],
  };
}

function generatedTypescript(pages, projects, writing, hash) {
  const exports = Object.entries(pageExports)
    .map(([key, [name, type]]) => typedExport(name, pages[key], type))
    .join("\n\n");
  return `/* generated by scripts/content/generate-public-content.mjs */\nimport type {\n  CmsProjectContent,\n  CmsWritingContent,\n  HomepageContent,\n  ListingPageContent,\n  NewsletterContent,\n  OrchestratingPageContent,\n  SystemsPageContent,\n} from "@anipotts/types";\n\nexport const PUBLIC_CONTENT_SOURCE_HASH = ${JSON.stringify(hash)};\n\n${exports}\n\nexport const HOME_SECTION_ORDER: HomepageContent["section_order"] = DEFAULT_HOMEPAGE_CONTENT.section_order;\n\n${typedExport("DEFAULT_CMS_PROJECTS", projects, "CmsProjectContent[]")}\n\n${typedExport("DEFAULT_CMS_WRITING", writing, "CmsWritingContent[]")}\n`;
}

function typedExport(name, value, type) {
  return `export const ${name}: ${type} = ${JSON.stringify(value, null, 2)};`;
}

function pageRoute(key) {
  return key === "home"
    ? "/"
    : key === "newsletter_archive"
      ? "/newsletter/archive"
      : `/${key}`;
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
