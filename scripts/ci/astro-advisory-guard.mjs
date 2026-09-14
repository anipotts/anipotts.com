#!/usr/bin/env node

// Keeps three Astro advisories unreachable until the Astro major upgrade.
// Evidence and removal conditions: docs/security/astro-advisory-exposure.md.
// Each rule retires itself once the Astro installed for an app reaches the
// first fixed version, so the upgrade PR shows every rule as skipped.

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export const APPS = ["www", "admin"];

export const ADVISORIES = [
  {
    id: "GHSA-26w7-cxv4-gfx2",
    fixedIn: "7.2.8",
    title: "AVIF decoding through sharp and libheif",
  },
  {
    id: "GHSA-2pvr-wf23-7pc7",
    fixedIn: "6.4.6",
    title: "Host header SSRF in prerendered error page fetch",
  },
  {
    id: "GHSA-8hv8-536x-4wqp",
    fixedIn: "6.3.3",
    title: "reflected XSS through slot names",
  },
];

const [IMAGE, ERROR_PAGE, SLOT] = ADVISORIES;

const SUMMARIES = {
  astro_config_missing: "astro config not found for the app",
  image_service_not_passthrough:
    'cloudflare adapter must keep imageService "passthrough" so no image is decoded',
  sharp_image_service: "image service must not point at sharp",
  image_remote_sources:
    "image.domains and image.remotePatterns must stay unset",
  image_config_unverifiable:
    "image config must be an inline object literal in the exported config",
  astro_assets_import: "astro:assets image processing is not allowed",
  get_image_call: "getImage image processing is not allowed",
  astro_assets_component: "astro:assets <Image> and <Picture> are not allowed",
  sharp_import: "application code must not import sharp",
  adapter_not_cloudflare:
    "adapter must stay @astrojs/cloudflare, which serves error pages through ASSETS",
  worker_entry_unverifiable:
    "workerEntryPoint must be a literal path to an existing file",
  render_without_error_page_fetch:
    "app.render must pass its own prerenderedErrorPageFetch",
  global_error_page_fetch:
    "prerenderedErrorPageFetch must not use global fetch",
  dynamic_slot_name: "slot names must be string literals",
  dynamic_slot_lookup: "slot lookups must use string literal names",
};

const SCRIPT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);
const TEMPLATE_EXTENSIONS = new Set([".astro", ".mdx"]);
const CONFIG_NAMES = [
  "astro.config.mjs",
  "astro.config.ts",
  "astro.config.mts",
  "astro.config.js",
];
const CLOSERS = { "(": ")", "{": "}", "[": "]" };
// Variables that would point git at another repository or index.
const GIT_LOCATION_VARIABLES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OBJECT_DIRECTORY",
  "GIT_COMMON_DIR",
  "GIT_PREFIX",
];
const IMPORT_CONTEXT =
  /(?:(?<![\w$.])from\s*|(?<![\w$.])import\s*\(?\s*|(?<![\w$.])require\s*\(\s*)$/;
// The default import name directly before a module specifier.
const DEFAULT_IMPORT = /(?<![\w$.])import\s+([A-Za-z_$][\w$]*)\s+from\s*$/;
const GLOBAL_FETCH =
  /(?<![\w$.])fetch\b|\b(?:globalThis|self|window)\s*\??\.\s*fetch\b/;

export function compareVersions(left, right) {
  const a = parseVersion(left) ?? { numbers: [0, 0, 0], prerelease: "" };
  const b = parseVersion(right) ?? { numbers: [0, 0, 0], prerelease: "" };
  for (let index = 0; index < 3; index += 1) {
    if (a.numbers[index] !== b.numbers[index])
      return a.numbers[index] - b.numbers[index];
  }
  if (a.prerelease === b.prerelease) return 0;
  if (a.prerelease === null) return 1;
  if (b.prerelease === null) return -1;
  return a.prerelease < b.prerelease ? -1 : 1;
}

function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(value ?? "");
  if (!match) return null;
  return {
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4] ?? null,
  };
}

export function resolveAstroVersion(root, app) {
  try {
    const manifest = JSON.parse(
      readFileSync(
        join(root, "apps", app, "node_modules", "astro", "package.json"),
        "utf8",
      ),
    );
    if (typeof manifest.version === "string")
      return { version: manifest.version, source: "installed" };
  } catch {
    // Not installed here (for example the install-free Security Review job).
  }
  const locked = lockfileAstroVersion(root, app);
  return locked
    ? { version: locked, source: "pnpm-lock.yaml" }
    : { version: null, source: null };
}

function lockfileAstroVersion(root, app) {
  let lines;
  try {
    lines = readFileSync(join(root, "pnpm-lock.yaml"), "utf8").split(/\r?\n/);
  } catch {
    return null;
  }
  const start = lines.indexOf(`  apps/${app}:`);
  if (start === -1) return null;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^ {0,2}\S/.test(lines[index])) return null;
    if (lines[index] !== "      astro:") continue;
    for (let entry = index + 1; entry < lines.length; entry += 1) {
      if (!lines[entry].startsWith("        ")) break;
      const version = /^ {8}version: (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(
        lines[entry],
      );
      if (version) return version[1];
    }
  }
  return null;
}

// An unresolved or unparsable version keeps every rule active.
function isFixed(version, advisory) {
  return (
    parseVersion(version) !== null &&
    compareVersions(version, advisory.fixedIn) >= 0
  );
}

// A masked source keeps every offset and newline of the original. `text`
// blanks comments, so commented-out code neither satisfies nor trips a rule.
// `code` also blanks string literals, so prose quoted inside string data (an
// article body in the generated content projection, a test fixture) cannot
// match a code rule. `strings` keeps each literal for rules that need its
// value, such as import specifiers.
function createMask(source) {
  return {
    source,
    text: source.split(""),
    code: source.split(""),
    strings: [],
  };
}

function finishMask(mask) {
  return {
    text: mask.text.join(""),
    code: mask.code.join(""),
    strings: mask.strings,
  };
}

function blankRange(chars, start, stop) {
  for (let index = start; index < stop; index += 1) {
    if (chars[index] !== "\n") chars[index] = " ";
  }
}

function restoreRange(mask, start, stop) {
  for (let index = start; index < stop; index += 1) {
    mask.text[index] = mask.source[index];
    mask.code[index] = mask.source[index];
  }
  mask.strings = mask.strings.filter((literal) => literal.end <= start);
}

function maskScript(source) {
  const mask = createMask(source);
  scanScript(mask, 0, source.length);
  return finishMask(mask);
}

// Scan JavaScript between start and end. With closeBrace, stop at the `}` that
// closes an enclosing `${` or template expression and return its index.
function scanScript(mask, start, end, closeBrace = false) {
  const { source } = mask;
  let depth = 0;
  let previous = "";
  let index = start;
  while (index < end) {
    const char = source[index];
    const next = source[index + 1];
    // Markup inside an Astro expression can hold an HTML comment. An unclosed
    // `<!--` stays text.
    const htmlClose = source.startsWith("<!--", index)
      ? source.indexOf("-->", index + 4)
      : -1;
    if (htmlClose !== -1 && htmlClose + 3 <= end) {
      blankRange(mask.text, index, htmlClose + 3);
      blankRange(mask.code, index, htmlClose + 3);
      index = htmlClose + 3;
      continue;
    }
    // `https://` in JSX text is not a comment, and formatted code never puts
    // one directly after `word:`.
    const lineComment =
      char === "/" &&
      next === "/" &&
      !/\w:$/.test(source.slice(Math.max(0, index - 2), index));
    if (lineComment || (char === "/" && next === "*")) {
      const close = lineComment
        ? source.indexOf("\n", index)
        : source.indexOf("*/", index + 2);
      const stop =
        close === -1 ? end : Math.min(end, lineComment ? close : close + 2);
      blankRange(mask.text, index, stop);
      blankRange(mask.code, index, stop);
      index = stop;
      continue;
    }
    if (char === '"' || char === "'") {
      const close = skipString(source, index);
      if (close >= end || source[close] !== char) {
        // An unpaired quote, such as an apostrophe in JSX text, is not a string.
        previous = char;
        index += 1;
        continue;
      }
      mask.strings.push({
        start: index,
        end: close + 1,
        value: source.slice(index + 1, close),
      });
      blankRange(mask.code, index, close + 1);
      previous = char;
      index = close + 1;
      continue;
    }
    if (char === "`") {
      index = scanTemplateLiteral(mask, index, end);
      previous = char;
      continue;
    }
    // A regular expression is blanked like a string so its quotes and brackets
    // cannot unbalance later scans. `}` does not start one: in JSX it precedes
    // `/>` or text such as `{done}/{total}`, and formatted code never begins a
    // statement with a regex after a block.
    if (char === "/" && (previous === "" || /[(,=:[!&|?{;]/.test(previous))) {
      const close = regExpEnd(source, index);
      if (close !== -1 && close < end) {
        blankRange(mask.text, index, close + 1);
        blankRange(mask.code, index, close + 1);
        previous = "/";
        index = close + 1;
        continue;
      }
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      if (closeBrace && depth === 0) return index;
      depth -= 1;
    }
    if (!/\s/.test(char)) previous = char;
    index += 1;
  }
  return end;
}

// Blank a template literal's text in `code` while each `${...}` substitution
// stays live code. Returns the index after the closing backtick.
function scanTemplateLiteral(mask, start, end) {
  const { source } = mask;
  let chunk = start;
  let substituted = false;
  let index = start + 1;
  while (index < end) {
    const char = source[index];
    if (char === "\\") {
      index += 2;
    } else if (char === "`") {
      blankRange(mask.code, chunk, index + 1);
      if (!substituted) {
        mask.strings.push({
          start,
          end: index + 1,
          value: source.slice(start + 1, index),
        });
      }
      return index + 1;
    } else if (char === "$" && source[index + 1] === "{") {
      // Keep the braces so brackets in `code` stay balanced.
      blankRange(mask.code, chunk, index + 1);
      const close = scanScript(mask, index + 2, end, true);
      substituted = true;
      chunk = close + 1;
      index = close + 1;
    } else {
      index += 1;
    }
  }
  // Unterminated: leave the rest of `code` readable rather than hide it.
  for (let cursor = start; cursor < end; cursor += 1)
    mask.code[cursor] = mask.text[cursor];
  return end;
}

function skipString(source, start) {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length && source[index] !== quote) {
    if (source[index] === "\\") index += 1;
    else if (quote !== "`" && source[index] === "\n") return index;
    index += 1;
  }
  return index;
}

// The closing `/` of a regular expression that opens at start, or -1 when the
// line ends first. An unclosed `/` is division or text, not a regex.
function regExpEnd(source, start) {
  let inClass = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\n") return -1;
    if (char === "\\" && source[index + 1] !== "\n") index += 1;
    else if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    else if (char === "/" && !inClass) return index;
  }
  return -1;
}

// Split an .astro or .mdx file into its frontmatter script and its markup.
function maskTemplate(source) {
  const mask = createMask(source);
  const open = /^\s*---\r?\n/.exec(source);
  const close = open ? /^---/m.exec(source.slice(open[0].length)) : null;
  const templateStart = close ? open[0].length + close.index + 3 : 0;
  if (close) scanScript(mask, open[0].length, templateStart - 3);
  const clientRanges = scanMarkup(mask, templateStart, source.length);
  return { ...finishMask(mask), templateStart, clientRanges };
}

// Walk template markup. HTML comments are blanked, `{...}` expressions are
// scanned as script, quoted attribute values stay literal text, and <script>
// and <style> bodies are recorded so slot rules skip client code.
function scanMarkup(mask, start, end) {
  const { source } = mask;
  const clientRanges = [];
  let inTag = false;
  let index = start;
  while (index < end) {
    const char = source[index];
    if (char === "{") {
      const close = scanScript(mask, index + 1, end, true);
      if (close < end) {
        index = close + 1;
        continue;
      }
      // No closing brace: text in the expression, such as an apostrophe or a
      // glob, misled the script scan. Undo it and read the rest as markup.
      restoreRange(mask, index + 1, end);
      index += 1;
    } else if (inTag) {
      if (char === '"' || char === "'") {
        const close = source.indexOf(char, index + 1);
        index = close === -1 ? end : close + 1;
        continue;
      }
      if (char === ">") inTag = false;
      index += 1;
    } else if (source.startsWith("<!--", index)) {
      const close = source.indexOf("-->", index + 4);
      const stop = close === -1 ? end : close + 3;
      blankRange(mask.text, index, stop);
      blankRange(mask.code, index, stop);
      index = stop;
    } else if (char === "<") {
      const client = /^<(script|style)\b[^>]*>/i.exec(
        source.slice(index, index + 1000),
      );
      // Only a closed element has a body; a self-closing or unclosed tag is
      // ordinary markup, so it cannot hide the rest of the template.
      const bodyStart = client ? index + client[0].length : -1;
      const close =
        client && !client[0].endsWith("/>")
          ? source
              .slice(bodyStart, end)
              .search(new RegExp(`</${client[1]}\\s*>`, "i"))
          : -1;
      if (close !== -1) {
        const bodyEnd = bodyStart + close;
        if (client[1].toLowerCase() === "script")
          scanScript(mask, bodyStart, bodyEnd);
        clientRanges.push([bodyStart, bodyEnd]);
        index = bodyEnd;
        continue;
      }
      if (/[A-Za-z/]/.test(source[index + 1] ?? "")) inTag = true;
      index += 1;
    } else {
      index += 1;
    }
  }
  return clientRanges;
}

function closingIndex(text, openIndex) {
  const closer = CLOSERS[text[openIndex]];
  let depth = 0;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' || char === "'" || char === "`") {
      index = skipString(text, index);
    } else if (CLOSERS[char]) {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) return char === closer ? index : -1;
    }
  }
  return -1;
}

function balanced(text, openIndex) {
  const close = closingIndex(text, openIndex);
  return close === -1 ? null : text.slice(openIndex + 1, close);
}

function isStringLiteral(expression) {
  const value = expression.trim();
  if (/^(["'])(?:\\.|(?!\1)[^\\\n])*\1$/.test(value)) return true;
  return /^`[^`]*`$/.test(value) && !value.includes("${");
}

function firstArgument(args) {
  let depth = 0;
  for (let index = 0; index < args.length; index += 1) {
    const char = args[index];
    if (char === '"' || char === "'" || char === "`") {
      index = skipString(args, index);
    } else if (CLOSERS[char]) {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      return args.slice(0, index);
    }
  }
  return args;
}

function lineAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}

function nextNonSpace(text, index) {
  let cursor = index;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor += 1;
  return cursor;
}

function stringAt(masked, index) {
  masked.stringsByStart ??= new Map(
    masked.strings.map((literal) => [literal.start, literal]),
  );
  return masked.stringsByStart.get(index) ?? null;
}

function isImportSpecifier(masked, literal) {
  return IMPORT_CONTEXT.test(
    masked.code.slice(Math.max(0, literal.start - 40), literal.start),
  );
}

function isInClientCode(source, index) {
  return source.clientRanges.some(
    ([start, stop]) => index >= start && index < stop,
  );
}

// Depth-0 properties of the object literal whose `{` sits at openIndex: the
// key (identifier or quoted), where its value starts, and shorthand or spread
// entries, which carry no value.
function objectProperties(masked, openIndex) {
  const close = closingIndex(masked.text, openIndex);
  if (close === -1) return [];
  const properties = [];
  let depth = 0;
  let segment = openIndex + 1;
  for (let index = openIndex + 1; index <= close; index += 1) {
    const char = masked.code[index];
    if (index === close || (char === "," && depth === 0)) {
      const property = readProperty(masked, segment, index);
      if (property) properties.push(property);
      segment = index + 1;
    } else if (CLOSERS[char]) {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
    }
  }
  return properties;
}

function readProperty(masked, start, stop) {
  const index = nextNonSpace(masked.text, start);
  if (index >= stop) return null;
  let key;
  let afterKey;
  const quoted = stringAt(masked, index);
  if (quoted && quoted.end <= stop) {
    key = quoted.value;
    afterKey = quoted.end;
  } else {
    const name = /^(?:\.\.\.|[A-Za-z_$][\w$]*)/.exec(
      masked.text.slice(index, stop),
    );
    if (!name) return { key: null, index, stop };
    if (name[0] === "...") return { key: null, spread: true, index, stop };
    key = name[0];
    afterKey = index + key.length;
  }
  const next = nextNonSpace(masked.text, afterKey);
  if (next >= stop) return { key, index, stop, shorthand: true };
  if (masked.text[next] !== ":") return { key, index, stop };
  return { key, index, stop, valueIndex: nextNonSpace(masked.text, next + 1) };
}

function hasStringValue(masked, property, value) {
  if (property.valueIndex === undefined) return false;
  const literal = stringAt(masked, property.valueIndex);
  return (
    literal?.value === value &&
    masked.code.slice(literal.end, property.stop).trim() === ""
  );
}

// The value expression that starts at index: up to a depth-0 comma,
// semicolon, unmatched closer, or a line break that ends the expression.
function expressionAt(code, start) {
  let depth = 0;
  for (let index = start; index < code.length; index += 1) {
    const char = code[index];
    if (CLOSERS[char]) {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      if (depth === 0) return code.slice(start, index);
      depth -= 1;
    } else if (depth === 0 && (char === "," || char === ";")) {
      return code.slice(start, index);
    } else if (depth === 0 && char === "\n") {
      const sofar = code.slice(start, index);
      if (sofar.trim() !== "" && !/(?:=>|[(,?:=|&+\-*/])\s*$/.test(sofar))
        return sofar;
    }
  }
  return code.slice(start);
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function hasSourceExtension(path) {
  const extension = extname(path);
  return SCRIPT_EXTENSIONS.has(extension) || TEMPLATE_EXTENSIONS.has(extension);
}

function isIgnoredSegment(name) {
  return name.startsWith(".") || name === "node_modules" || name === "dist";
}

// Tracked and new untracked files, never gitignored outputs such as the
// generated public content projection, which exists only where content
// generation ran. Null when root is not the top of a git checkout.
function gitSourceFiles(root) {
  const env = { ...process.env };
  for (const name of GIT_LOCATION_VARIABLES) delete env[name];
  const git = (args) =>
    spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env,
      maxBuffer: 64 * 1024 * 1024,
    });
  const top = git(["rev-parse", "--show-toplevel"]);
  if (top.error || top.status !== 0) return null;
  try {
    if (realpathSync(top.stdout.trim()) !== realpathSync(root)) return null;
  } catch {
    return null;
  }
  const listed = git([
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ...APPS.map((app) => `apps/${app}/src`),
    "packages",
  ]);
  if (listed.error || listed.status !== 0) return null;
  return [...new Set(listed.stdout.split("\0").filter(Boolean))]
    .filter(
      (file) =>
        hasSourceExtension(file) && !file.split("/").some(isIgnoredSegment),
    )
    .map((file) => join(root, file))
    .filter(isFile)
    .sort();
}

function walkSourceFiles(directory) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (isIgnoredSegment(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(path));
    } else if (
      (entry.isFile() || entry.isSymbolicLink()) &&
      hasSourceExtension(entry.name) &&
      isFile(path)
    ) {
      files.push(path);
    }
  }
  return files.sort();
}

// Source files under a directory: from git when root is a checkout, so every
// required check sees the same tree, and from the filesystem otherwise.
function sourceLister(root) {
  const listed = gitSourceFiles(root);
  if (!listed) return walkSourceFiles;
  return (directory) =>
    listed.filter((path) => path.startsWith(directory + sep));
}

function readSource(root, path) {
  const source = readFileSync(path, "utf8");
  const file = relative(root, path).split(sep).join("/");
  if (TEMPLATE_EXTENSIONS.has(extname(path)))
    return { file, template: true, ...maskTemplate(source) };
  return {
    file,
    template: false,
    templateStart: 0,
    clientRanges: [],
    ...maskScript(source),
  };
}

function readConfig(root, app) {
  for (const name of CONFIG_NAMES) {
    const path = join(root, "apps", app, name);
    if (existsSync(path)) {
      return {
        file: `apps/${app}/${name}`,
        ...maskScript(readFileSync(path, "utf8")),
      };
    }
  }
  return null;
}

// Depth-0 properties of the object passed to defineConfig or exported as the
// default, or null when the config is not written that way.
function configProperties(config) {
  const open = /\bdefineConfig\s*\(\s*\{|\bexport\s+default\s*\{/.exec(
    config.code,
  );
  return open
    ? objectProperties(config, open.index + open[0].length - 1)
    : null;
}

function adapterOf(config, properties) {
  const property = properties?.findLast(
    (entry) => entry.key === "adapter" && entry.valueIndex !== undefined,
  );
  if (!property) return null;
  const call = /^([A-Za-z_$][\w$]*)\s*\(/.exec(
    config.code.slice(property.valueIndex),
  );
  if (!call) return null;
  const optionsIndex = nextNonSpace(
    config.text,
    property.valueIndex + call[0].length,
  );
  return {
    line: lineAt(config.text, property.index),
    options:
      config.text[optionsIndex] === "{"
        ? objectProperties(config, optionsIndex)
        : [],
    cloudflare: config.strings.some(
      (literal) =>
        literal.value === "@astrojs/cloudflare" &&
        DEFAULT_IMPORT.exec(
          config.code.slice(Math.max(0, literal.start - 200), literal.start),
        )?.[1] === call[1],
    ),
  };
}

function imageConfigFindings(config, properties, adapter) {
  const findings = [];
  const at = (rule, index) => ({
    rule,
    file: config.file,
    line: index === undefined ? 1 : lineAt(config.text, index),
  });

  // Only the adapter's own top-level option counts. The adapter defaults to
  // "compile" (sharp), so a missing option fails too.
  const services = (adapter?.options ?? []).filter(
    (option) => option.key === "imageService",
  );
  const wrong = services.find(
    (option) => !hasStringValue(config, option, "passthrough"),
  );
  if (wrong) {
    findings.push(at("image_service_not_passthrough", wrong.index));
  } else if (!adapter?.cloudflare || services.length === 0) {
    findings.push({
      rule: "image_service_not_passthrough",
      file: config.file,
      line: adapter?.line ?? 1,
    });
  }

  for (const match of config.code.matchAll(/\bsharpImageService\b/g))
    findings.push(at("sharp_image_service", match.index));
  for (const literal of config.strings) {
    if (literal.value === "astro/assets/services/sharp")
      findings.push(at("sharp_image_service", literal.start));
  }

  if (!properties) {
    findings.push(at("image_config_unverifiable"));
    return findings;
  }
  for (const image of properties.filter((entry) => entry.key === "image")) {
    if (
      image.valueIndex === undefined ||
      config.text[image.valueIndex] !== "{"
    ) {
      findings.push(at("image_config_unverifiable", image.index));
      continue;
    }
    for (const option of objectProperties(config, image.valueIndex)) {
      if (option.spread)
        findings.push(at("image_config_unverifiable", option.index));
      else if (option.key === "domains" || option.key === "remotePatterns")
        findings.push(at("image_remote_sources", option.index));
    }
  }
  return findings;
}

function imageSourceFindings(source) {
  const findings = [];
  const add = (rule, index) =>
    findings.push({
      rule,
      file: source.file,
      line: lineAt(source.text, index),
    });
  for (const literal of source.strings) {
    if (literal.value === "astro:assets")
      add("astro_assets_import", literal.start);
    else if (literal.value === "sharp" && isImportSpecifier(source, literal))
      add("sharp_import", literal.start);
  }
  for (const match of source.code.matchAll(/\bgetImage\s*\(/g))
    add("get_image_call", match.index);
  if (source.template) {
    for (const match of source.code
      .slice(source.templateStart)
      .matchAll(/<(?:Image|Picture)\b/g))
      add("astro_assets_component", source.templateStart + match.index);
  }
  return findings;
}

function workerEntryFindings(root, app, config, adapter) {
  const entry = (adapter?.options ?? []).findLast(
    (option) => option.key === "workerEntryPoint",
  );
  if (!entry) return { findings: [], path: null };
  const unverifiable = {
    findings: [
      {
        rule: "worker_entry_unverifiable",
        file: config.file,
        line: lineAt(config.text, entry.index),
      },
    ],
    path: null,
  };
  if (entry.valueIndex === undefined || config.text[entry.valueIndex] !== "{")
    return unverifiable;
  const option = objectProperties(config, entry.valueIndex).findLast(
    (candidate) => candidate.key === "path",
  );
  const literal =
    option?.valueIndex === undefined
      ? null
      : stringAt(config, option.valueIndex);
  if (!literal || !/^\.{1,2}\//.test(literal.value)) return unverifiable;
  const path = resolveModule(join(root, "apps", app, literal.value));
  return path ? { findings: [], path } : unverifiable;
}

// A relative import resolved the way the bundler does: as written, with a
// source extension, as a directory index, or a `.js` specifier for `.ts`.
function resolveModule(base) {
  const extensions = [...SCRIPT_EXTENSIONS];
  const candidates = [
    base,
    ...extensions.map((extension) => base + extension),
    ...extensions.map((extension) => join(base, `index${extension}`)),
  ];
  const typed = { ".js": [".ts", ".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] };
  for (const extension of typed[extname(base)] ?? [])
    candidates.push(base.slice(0, -extname(base).length) + extension);
  return candidates.find(isFile) ?? null;
}

// Every local module a worker entry pulls in that the source trees do not
// already cover, so a thin entry cannot re-export an unscanned server.
function entryModules(root, entry, isCovered, sourceAt) {
  const modules = [];
  const seen = new Set([entry]);
  const queue = [entry];
  while (queue.length > 0) {
    const path = queue.shift();
    if (!hasSourceExtension(path)) continue;
    if (!isCovered(path)) modules.push(path);
    const source = sourceAt(path);
    for (const literal of source.strings) {
      if (!/^\.{1,2}\//.test(literal.value)) continue;
      if (!isImportSpecifier(source, literal)) continue;
      const target = resolveModule(resolve(dirname(path), literal.value));
      if (!target || seen.has(target)) continue;
      const inside = relative(root, target);
      if (inside.startsWith("..") || isAbsolute(inside)) continue;
      if (inside.split(sep).includes("node_modules")) continue;
      seen.add(target);
      queue.push(target);
    }
  }
  return modules;
}

function errorPageSourceFindings(source) {
  const findings = [];
  const add = (rule, index) =>
    findings.push({
      rule,
      file: source.file,
      line: lineAt(source.text, index),
    });
  for (const match of source.code.matchAll(
    /\bprerenderedErrorPageFetch\s*(?::|=(?![=>]))\s*/g,
  )) {
    const value = expressionAt(source.code, match.index + match[0].length);
    if (GLOBAL_FETCH.test(value)) add("global_error_page_fetch", match.index);
  }

  // Only code that builds its own Astro App can call app.render; the adapter's
  // handler always supplies the ASSETS-backed fetcher.
  const ownsApp =
    source.strings.some(
      (literal) =>
        literal.value === "astro/app" || literal.value === "astro/app/node",
    ) || /\b(?:NodeApp|createRequestFromNodeRequest)\b/.test(source.code);
  if (!ownsApp) return findings;
  for (const match of source.code.matchAll(/\.render\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    const close = closingIndex(source.text, open);
    if (
      close === -1 ||
      !/\bprerenderedErrorPageFetch\b/.test(source.code.slice(open, close))
    )
      add("render_without_error_page_fetch", match.index);
  }
  return findings;
}

function slotSourceFindings(source) {
  if (!source.template) return [];
  const findings = [];
  const add = (rule, index) =>
    findings.push({
      rule,
      file: source.file,
      line: lineAt(source.text, index),
    });
  const offset = source.templateStart;
  const template = source.code.slice(offset);

  for (const match of template.matchAll(/(?<![\w$.:-])slot\s*=\s*([{`])/g)) {
    const index = offset + match.index;
    if (isInClientCode(source, index)) continue;
    const valueStart = index + match[0].length - 1;
    const value =
      match[1] === "{"
        ? balanced(source.text, valueStart)
        : source.text.slice(
            valueStart,
            skipString(source.text, valueStart) + 1,
          );
    if (value === null || !isStringLiteral(value))
      add("dynamic_slot_name", index);
  }

  for (const match of template.matchAll(/<slot\b[^>]*?\sname\s*=\s*\{/g)) {
    const index = offset + match.index;
    if (isInClientCode(source, index)) continue;
    const value = balanced(source.text, index + match[0].length - 1);
    if (value === null || !isStringLiteral(value))
      add("dynamic_slot_lookup", index);
  }

  for (const match of source.code.matchAll(
    /\bslots\s*\.\s*(?:render|has)\s*\(/g,
  )) {
    const args = balanced(source.text, match.index + match[0].length - 1);
    if (args === null || !isStringLiteral(firstArgument(args)))
      add("dynamic_slot_lookup", match.index);
  }
  return findings;
}

const SOURCE_SCANS = {
  [IMAGE.id]: imageSourceFindings,
  [ERROR_PAGE.id]: errorPageSourceFindings,
  [SLOT.id]: slotSourceFindings,
};

// Config-level findings for one app.
function configFindings(app, advisory, context) {
  const { config, properties, adapter } = context;
  if (advisory === SLOT) return [];
  if (!config) {
    return [
      {
        rule: "astro_config_missing",
        file: `apps/${app}/astro.config.mjs`,
        line: 1,
      },
    ];
  }
  if (advisory === IMAGE)
    return imageConfigFindings(config, properties, adapter);
  const findings = adapter?.cloudflare
    ? []
    : [
        {
          rule: "adapter_not_cloudflare",
          file: config.file,
          line: adapter?.line ?? 1,
        },
      ];
  return [...findings, ...context.entry.findings];
}

export function auditAstroAdvisories(root) {
  const apps = APPS.map((app) => ({ app, ...resolveAstroVersion(root, app) }));
  const checked = [];
  const skipped = [];
  const findings = new Map();
  const record = (advisory, app, items) => {
    for (const item of items) {
      const finding = {
        advisory: advisory.id,
        fixedIn: advisory.fixedIn,
        app,
        file: item.file,
        line: item.line,
        rule: item.rule,
        summary: SUMMARIES[item.rule],
      };
      const key = `${finding.advisory}|${finding.file}|${finding.line}|${finding.rule}`;
      if (!findings.has(key)) findings.set(key, finding);
    }
  };

  const listSourceFiles = sourceLister(root);
  const sources = new Map();
  const sourceAt = (path) => {
    if (!sources.has(path)) sources.set(path, readSource(root, path));
    return sources.get(path);
  };
  let packageNames = [];
  try {
    packageNames = readdirSync(join(root, "packages")).sort();
  } catch {
    // A checkout without workspace packages has nothing shared to scan.
  }
  const sourceRoots = [
    ...APPS.map((app) => join(root, "apps", app, "src")),
    ...packageNames.map((name) => join(root, "packages", name, "src")),
  ];
  const isCovered = (path) =>
    sourceRoots.some((directory) => path.startsWith(directory + sep));
  const sharedPaths = packageNames.flatMap((name) =>
    listSourceFiles(join(root, "packages", name, "src")),
  );

  const contexts = new Map();
  const contextFor = (app) => {
    if (!contexts.has(app)) {
      const config = readConfig(root, app);
      const properties = config ? configProperties(config) : null;
      const adapter = config ? adapterOf(config, properties) : null;
      const entry = config
        ? workerEntryFindings(root, app, config, adapter)
        : { findings: [], path: null };
      const extra = entry.path
        ? entryModules(root, entry.path, isCovered, sourceAt)
        : [];
      const paths = listSourceFiles(join(root, "apps", app, "src"));
      contexts.set(app, {
        config,
        properties,
        adapter,
        entry,
        paths: [...new Set([...paths, ...extra])],
      });
    }
    return contexts.get(app);
  };

  for (const advisory of ADVISORIES) {
    const scan = SOURCE_SCANS[advisory.id];
    let active = false;
    for (const { app, version } of apps) {
      if (isFixed(version, advisory)) {
        skipped.push({
          advisory: advisory.id,
          app,
          version,
          fixedIn: advisory.fixedIn,
        });
        continue;
      }
      checked.push({ advisory: advisory.id, app, version });
      active = true;
      const context = contextFor(app);
      record(advisory, app, configFindings(app, advisory, context));
      for (const path of context.paths)
        record(advisory, app, scan(sourceAt(path)));
    }

    // Workspace packages compile into both apps, so they stay guarded while
    // any app remains below the fixed version.
    if (!active) continue;
    for (const path of sharedPaths)
      record(advisory, "shared", scan(sourceAt(path)));
  }

  return {
    apps,
    checked,
    skipped,
    findings: [...findings.values()].sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.advisory.localeCompare(b.advisory),
    ),
  };
}

export function formatAdvisoryFinding(finding) {
  return `${finding.file}:${finding.line} ${finding.advisory} ${finding.rule}: ${finding.summary} (first fixed in astro ${finding.fixedIn})`;
}

export function formatAdvisorySummary(report) {
  return report.apps
    .map(({ app, version, source }) => {
      const ids = report.checked
        .filter((entry) => entry.app === app)
        .map((entry) => entry.advisory);
      const label = version
        ? `astro ${version} (${source})`
        : "astro unresolved";
      return `${app} ${label} checked ${ids.join(", ") || "none"}`;
    })
    .join("; ");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = auditAstroAdvisories(process.cwd());
  if (report.findings.length > 0) {
    for (const finding of report.findings)
      console.error(formatAdvisoryFinding(finding));
    process.exit(1);
  }
  console.log(`astro advisory guard passed: ${formatAdvisorySummary(report)}`);
}
