#!/usr/bin/env node
/**
 * Builds the brand mark outputs from the vendored files in
 * packages/brand/marks:
 *
 * - `sprite.svg`: every flat glyph in `svg/` as one cached `<symbol>` sprite;
 * - `src/marks.generated.ts`: the sprite URL and the per-mark file URLs, as
 *   lazy, never-inlined asset imports;
 * - the file ledger in `MARKS.md`: every vendored file with its size and
 *   SHA-256.
 *
 * It fails when a file has no provenance row, a provenance row has no file, a
 * glyph is not flat, or a glyph comes from a simple-icons id the project has
 * hidden at its owner's request. `--check` writes nothing and fails on drift.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MARKS = join(ROOT, "packages/brand/marks");
const SPRITE = join(MARKS, "sprite.svg");
const LEDGER = join(MARKS, "MARKS.md");
const GENERATED = join(ROOT, "packages/brand/src/marks.generated.ts");

/** simple-icons ids removed at the brand owner's request. Their marks come
 * from the owner's own kit, never from simple-icons. */
export const HIDDEN_SIMPLE_ICONS = Object.freeze([
  "linkedin",
  "microsoft",
  "openai",
  "sandisk",
  "slack",
  "windows",
]);

const ID = /^[a-z0-9][a-z0-9-]*$/;
/** A flat glyph: one viewBox, plain shapes, no ids, fills, styles or links.
 * Colour comes from the tile, so the sprite never carries a brand's paint. */
const GLYPH =
  /^<svg viewBox="([0-9. -]+)">((?:<path d="[^"]+"\/>)+)<\/svg>\n?$/;
const RASTER = /^([a-z0-9][a-z0-9-]*)-(56\.webp|112\.webp|112\.png)$/;
const STANDALONE = /^([a-z0-9][a-z0-9-]*)\.svg$/;
const UNSAFE_SVG = /<script|<foreignObject|\son[a-z]+=|(?:xlink:)?href="(?!#)/i;
const FILES_START = "<!-- files:start -->";
const FILES_END = "<!-- files:end -->";

export async function buildMarks({ check = false } = {}) {
  const problems = [];
  const glyphs = readGlyphs(problems);
  const files = readFiles(problems);
  for (const id of Object.keys(files))
    if (glyphs.has(id)) problems.push(`${id} is both a glyph and a file mark`);

  const ids = [...new Set([...glyphs.keys(), ...Object.keys(files)])].sort();
  const ledger = readFileSync(LEDGER, "utf8");
  checkSources(ledger, ids, problems);

  const sprite = spriteSource(glyphs);
  const generated = await format(generatedSource(glyphs, files), "typescript");
  const nextLedger = await format(withFileLedger(ledger, sprite), "markdown");

  const outputs = [
    [SPRITE, sprite],
    [GENERATED, generated],
    [LEDGER, nextLedger],
  ];
  for (const [path, contents] of outputs) {
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (current === contents) continue;
    if (check) problems.push(`${relative(ROOT, path)} is out of date`);
    else writeFileSync(path, contents);
  }
  return { ids, problems };
}

function readGlyphs(problems) {
  const glyphs = new Map();
  for (const name of readdirSync(join(MARKS, "svg")).sort()) {
    const id = name.replace(/\.svg$/, "");
    if (!name.endsWith(".svg") || !ID.test(id)) {
      problems.push(`svg/${name} is not an <id>.svg glyph`);
      continue;
    }
    const source = readFileSync(join(MARKS, "svg", name), "utf8");
    const match = GLYPH.exec(source);
    if (!match) {
      problems.push(
        `svg/${name} must be a flat glyph: one viewBox and plain paths`,
      );
      continue;
    }
    glyphs.set(id, { viewBox: match[1], body: match[2] });
  }
  return glyphs;
}

function readFiles(problems) {
  const files = {};
  for (const name of readdirSync(join(MARKS, "img")).sort()) {
    const raster = RASTER.exec(name);
    const standalone = STANDALONE.exec(name);
    if (raster) {
      const key = { "56.webp": "webp56", "112.webp": "webp112" }[raster[2]];
      (files[raster[1]] ??= {})[key ?? "png"] = `img/${name}`;
    } else if (standalone) {
      const source = readFileSync(join(MARKS, "img", name), "utf8");
      if (UNSAFE_SVG.test(source))
        problems.push(`img/${name} carries script, handlers or outside links`);
      (files[standalone[1]] ??= {}).svg = `img/${name}`;
    } else {
      problems.push(`img/${name} is not a mark rendition`);
    }
  }
  for (const [id, set] of Object.entries(files)) {
    const raster = ["webp56", "webp112", "png"].filter((key) => set[key]);
    if (set.svg && raster.length)
      problems.push(`${id} has both vector and raster files`);
    if (!set.svg && raster.length !== 3)
      problems.push(`${id} needs 56 and 112 px WebP and a 112 px PNG`);
  }
  return files;
}

/** The Sources table: `| mark | source | retrieved | source sha256 |`. */
export function parseSources(ledger) {
  const section = /^## Sources\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(ledger);
  if (!section) return [];
  return section[1]
    .split("\n")
    .filter((line) => /^\|\s*[a-z0-9]/.test(line))
    .map((line) => {
      const [mark, source, retrieved, sha] = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim());
      return { mark, source, retrieved, sha: sha.replace(/`/g, "") };
    })
    .filter((row) => row.mark !== "mark");
}

/** Provenance problems for a ledger and the mark ids that have files. */
export function sourceProblems(ledger, ids) {
  const problems = [];
  checkSources(ledger, ids, problems);
  return problems;
}

function checkSources(ledger, ids, problems) {
  const rows = parseSources(ledger);
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.mark))
      problems.push(`${row.mark} has more than one source row`);
    seen.add(row.mark);
    if (!ids.includes(row.mark))
      problems.push(`${row.mark} has a source row but no vendored file`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.retrieved))
      problems.push(`${row.mark} needs a retrieved date`);
    if (!/^[0-9a-f]{64}$/.test(row.sha))
      problems.push(`${row.mark} needs its source SHA-256`);
    const slug = /simple-icons@[0-9.]+\S*\s+`?icons\/([a-z0-9]+)\.svg/.exec(
      row.source,
    )?.[1];
    if (/simple-icons/.test(row.source) && !slug)
      problems.push(`${row.mark} must name its simple-icons icon file`);
    if (slug && HIDDEN_SIMPLE_ICONS.includes(slug))
      problems.push(
        `${row.mark} uses the hidden simple-icons id ${slug}; use the owner's kit`,
      );
  }
  for (const id of ids)
    if (!seen.has(id)) problems.push(`${id} has no source row in MARKS.md`);
}

function spriteSource(glyphs) {
  const symbols = [...glyphs]
    .map(
      ([id, { viewBox, body }]) =>
        `<symbol id="${id}" viewBox="${viewBox}">${body}</symbol>`,
    )
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg">\n${symbols}\n</svg>\n`;
}

function generatedSource(glyphs, files) {
  const imports = ['import sprite from "../marks/sprite.svg?url&no-inline";'];
  const entries = [];
  for (const [id, set] of Object.entries(files).sort()) {
    const fields = Object.entries(set).map(([key, path]) => {
      const name = `${camel(id)}${key[0].toUpperCase()}${key.slice(1)}`;
      imports.push(`import ${name} from "../marks/${path}?url&no-inline";`);
      return `${key}: ${name}`;
    });
    entries.push(`${JSON.stringify(id)}: { ${fields.join(", ")} }`);
  }
  return `// Generated by scripts/brand/build-marks.mjs from packages/brand/marks.
// Do not edit: run \`pnpm brand:marks\` after changing a vendored mark.
${imports.join("\n")}

/** One cached sprite holding every flat glyph as a <symbol>. */
export const MARK_SPRITE: string = sprite;

/** The glyph ids inside the sprite. */
export const MARK_GLYPHS = ${JSON.stringify([...glyphs.keys()])} as const;

/** Artwork fetched lazily per mark: WebP at 2x and 4x of the 28px tile with a
 * PNG fallback, or one standalone vector. */
export const MARK_FILES = {
${entries.join(",\n")}
} as const;
`;
}

function withFileLedger(ledger, sprite) {
  const rows = [];
  const add = (path, bytes) =>
    rows.push(`| \`${path}\` | ${bytes.length} | \`${sha256(bytes)}\` |`);
  for (const dir of ["svg", "img"])
    for (const name of readdirSync(join(MARKS, dir)).sort())
      add(`${dir}/${name}`, readFileSync(join(MARKS, dir, name)));
  add("sprite.svg", Buffer.from(sprite));
  const table = [
    FILES_START,
    "",
    "| file | bytes | sha256 |",
    "| --- | --- | --- |",
    ...rows,
    "",
    FILES_END,
  ].join("\n");
  const start = ledger.indexOf(FILES_START);
  const end = ledger.indexOf(FILES_END);
  if (start < 0 || end < start)
    return `${ledger.trimEnd()}\n\n## Files\n\n${table}\n`;
  return `${ledger.slice(0, start)}${table}${ledger.slice(end + FILES_END.length)}`;
}

async function format(source, parser) {
  const options = (await prettier.resolveConfig(LEDGER)) ?? {};
  return prettier.format(source, { ...options, parser, plugins: [] });
}

function camel(id) {
  const words = id.split("-");
  const name = words
    .map((word, index) =>
      index === 0 ? word : `${word[0].toUpperCase()}${word.slice(1)}`,
    )
    .join("");
  return /^[0-9]/.test(name) ? `mark${name}` : name;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const { ids, problems } = await buildMarks({ check });
  if (problems.length) {
    for (const problem of problems) console.error(`brand marks: ${problem}`);
    process.exit(1);
  }
  console.log(
    `brand marks ${check ? "match" : "built"}: ${ids.length} marks in packages/brand/marks`,
  );
}
