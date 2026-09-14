#!/usr/bin/env node

// Keeps three Astro advisories unreachable until the Astro major upgrade.
// Evidence and removal conditions: docs/security/astro-advisory-exposure.md.
// Each rule retires itself once the Astro installed for an app reaches the
// first fixed version, so the upgrade PR shows every rule as skipped.

import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";

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
  image_config_unverifiable: "image config must be an inline object literal",
  astro_assets_import: "astro:assets image processing is not allowed",
  get_image_call: "getImage image processing is not allowed",
  astro_assets_component: "astro:assets <Image> and <Picture> are not allowed",
  sharp_import: "application code must not import sharp",
  adapter_not_cloudflare:
    "adapter must stay @astrojs/cloudflare, which serves error pages through ASSETS",
  worker_entry_unverifiable:
    "workerEntryPoint must be a literal path to an existing file",
  render_without_error_page_fetch:
    "app.render must pass a prerenderedErrorPageFetch backed by ASSETS or disk",
  global_error_page_fetch: "prerenderedErrorPageFetch must not be global fetch",
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

// Blank out JavaScript comments while keeping strings, offsets and newlines, so
// commented-out config neither satisfies nor trips a rule and lines stay exact.
export function maskComments(source) {
  let output = "";
  let previous = "";
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === "/" && (next === "/" || next === "*")) {
      const end =
        next === "/"
          ? source.indexOf("\n", index)
          : source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : next === "/" ? end : end + 2;
      output += blank(source.slice(index, stop));
      index = stop;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      const stop = skipString(source, index) + 1;
      output += source.slice(index, stop);
      previous = char;
      index = stop;
      continue;
    }
    if (char === "/" && (previous === "" || /[(,=:[!&|?{};]/.test(previous))) {
      const stop = skipRegExp(source, index) + 1;
      output += source.slice(index, stop);
      previous = "/";
      index = stop;
      continue;
    }
    output += char;
    if (!/\s/.test(char)) previous = char;
    index += 1;
  }
  return output;
}

function blank(text) {
  return text.replace(/[^\n]/g, " ");
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

function skipRegExp(source, start) {
  let inClass = false;
  let index = start + 1;
  while (index < source.length && source[index] !== "\n") {
    const char = source[index];
    if (char === "\\") index += 1;
    else if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    else if (char === "/" && !inClass) return index;
    index += 1;
  }
  return index;
}

// Split an .astro or .mdx file into its frontmatter script and its template,
// masking comments in each while preserving offsets.
function maskTemplate(source) {
  const open = /^\s*---\r?\n/.exec(source);
  const close = open ? /^---/m.exec(source.slice(open[0].length)) : null;
  const scriptEnd = close ? open[0].length + close.index + 3 : 0;
  const script = close
    ? open[0] +
      maskComments(source.slice(open[0].length, scriptEnd - 3)) +
      "---"
    : "";
  const template = source
    .slice(scriptEnd)
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, blank);
  return { text: script + template, templateStart: scriptEnd };
}

function balanced(text, openIndex) {
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
      if (depth === 0) {
        return char === closer ? text.slice(openIndex + 1, index) : null;
      }
    }
  }
  return null;
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

function listSourceFiles(directory) {
  const files = [];
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    if (entry.name === "dist") continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(path));
    } else if (entry.isFile()) {
      const extension = extname(entry.name);
      if (
        SCRIPT_EXTENSIONS.has(extension) ||
        TEMPLATE_EXTENSIONS.has(extension)
      )
        files.push(path);
    }
  }
  return files.sort();
}

function readSource(root, path) {
  const source = readFileSync(path, "utf8");
  const file = relative(root, path).split(sep).join("/");
  if (TEMPLATE_EXTENSIONS.has(extname(path))) {
    const { text, templateStart } = maskTemplate(source);
    return { file, text, templateStart, template: true };
  }
  return {
    file,
    text: maskComments(source),
    templateStart: 0,
    template: false,
  };
}

function readConfig(root, app) {
  for (const name of CONFIG_NAMES) {
    const path = join(root, "apps", app, name);
    if (existsSync(path)) {
      return {
        file: `apps/${app}/${name}`,
        text: maskComments(readFileSync(path, "utf8")),
      };
    }
  }
  return null;
}

function adapterOf(config) {
  const call = /\badapter\s*:\s*([A-Za-z_$][\w$]*)\s*\(/.exec(config.text);
  if (!call) return null;
  const name = call[1].replace(/\$/g, "\\$");
  const imported = new RegExp(
    `\\bimport\\s+${name}\\s+from\\s+["']([^"']+)["']`,
  ).exec(config.text);
  const argsStart = call.index + call[0].length - 1;
  return {
    line: lineAt(config.text, call.index),
    argsStart: argsStart + 1,
    args: balanced(config.text, argsStart),
    cloudflare: imported?.[1] === "@astrojs/cloudflare",
  };
}

function imageConfigFindings(config, adapter) {
  const findings = [];
  const at = (rule, index) => ({
    rule,
    file: config.file,
    line: index === undefined ? 1 : lineAt(config.text, index),
  });

  // The adapter defaults to "compile" (sharp), so a missing option fails too.
  const services = adapter?.args
    ? [...adapter.args.matchAll(/\bimageService\s*:\s*/g)]
    : [];
  const wrong = services.find(
    (service) =>
      !/^(["'`])passthrough\1/.test(
        adapter.args.slice(service.index + service[0].length),
      ),
  );
  if (wrong) {
    findings.push(
      at("image_service_not_passthrough", adapter.argsStart + wrong.index),
    );
  } else if (!adapter?.cloudflare || services.length === 0) {
    findings.push({
      rule: "image_service_not_passthrough",
      file: config.file,
      line: adapter?.line ?? 1,
    });
  }

  for (const match of config.text.matchAll(
    /\bsharpImageService\b|["'`]astro\/assets\/services\/sharp["'`]/g,
  )) {
    findings.push(at("sharp_image_service", match.index));
  }

  for (const match of config.text.matchAll(/\bimage\s*:\s*/g)) {
    const valueStart = match.index + match[0].length;
    if (config.text[valueStart] !== "{") {
      findings.push(at("image_config_unverifiable", match.index));
      continue;
    }
    const body = balanced(config.text, valueStart) ?? "";
    for (const source of body.matchAll(/\b(?:domains|remotePatterns)\b/g)) {
      findings.push(at("image_remote_sources", valueStart + 1 + source.index));
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
  for (const match of source.text.matchAll(/["'`]astro:assets["'`]/g))
    add("astro_assets_import", match.index);
  for (const match of source.text.matchAll(/\bgetImage\s*\(/g))
    add("get_image_call", match.index);
  for (const match of source.text.matchAll(
    /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["'`]sharp["'`]/g,
  ))
    add("sharp_import", match.index);
  if (source.template) {
    for (const match of source.text
      .slice(source.templateStart)
      .matchAll(/<(?:Image|Picture)\b/g))
      add("astro_assets_component", source.templateStart + match.index);
  }
  return findings;
}

function workerEntryFindings(root, app, config, adapter) {
  const entry = adapter?.args
    ? /\bworkerEntryPoint\s*:\s*/.exec(adapter.args)
    : null;
  if (!entry) return { findings: [], path: null };
  const unverifiable = {
    findings: [
      {
        rule: "worker_entry_unverifiable",
        file: config.file,
        line: lineAt(config.text, adapter.argsStart + entry.index),
      },
    ],
    path: null,
  };
  const valueStart = adapter.argsStart + entry.index + entry[0].length;
  if (config.text[valueStart] !== "{") return unverifiable;
  const body = balanced(config.text, valueStart) ?? "";
  const path = /\bpath\s*:\s*(["'])(\.{1,2}\/[^"']+)\1/.exec(body)?.[2];
  if (!path) return unverifiable;
  const base = join(root, "apps", app, path);
  const resolved = [
    base,
    ...[...SCRIPT_EXTENSIONS].map((extension) => base + extension),
  ].find((candidate) => existsSync(candidate) && lstatSync(candidate).isFile());
  return resolved ? { findings: [], path: resolved } : unverifiable;
}

function errorPageSourceFindings(source) {
  const findings = [];
  const add = (rule, index) =>
    findings.push({
      rule,
      file: source.file,
      line: lineAt(source.text, index),
    });
  for (const match of source.text.matchAll(
    /\bprerenderedErrorPageFetch\s*:\s*(?:globalThis\s*\.\s*)?fetch\s*(?=[,}\n)])/g,
  ))
    add("global_error_page_fetch", match.index);

  // Only code that builds its own Astro App can call app.render; the adapter's
  // handler always supplies the ASSETS-backed fetcher.
  const ownsApp =
    /["'`]astro\/app(?:\/node)?["'`]/.test(source.text) ||
    /\b(?:NodeApp|createRequestFromNodeRequest)\b/.test(source.text);
  if (!ownsApp) return findings;
  for (const match of source.text.matchAll(/\.render\s*\(/g)) {
    const args = balanced(source.text, match.index + match[0].length - 1);
    if (args === null || !/\bprerenderedErrorPageFetch\b/.test(args))
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
  const template = source.text.slice(source.templateStart);
  const offset = source.templateStart;

  for (const match of template.matchAll(/\sslot\s*=\s*([{`])/g)) {
    const valueStart = match.index + match[0].length - 1;
    const value =
      match[1] === "{"
        ? balanced(template, valueStart)
        : template.slice(valueStart, skipString(template, valueStart) + 1);
    if (value === null || !isStringLiteral(value))
      add("dynamic_slot_name", offset + match.index + 1);
  }

  for (const match of template.matchAll(/<slot\b[^>]*?\sname\s*=\s*\{/g)) {
    const value = balanced(template, match.index + match[0].length - 1);
    if (value === null || !isStringLiteral(value))
      add("dynamic_slot_lookup", offset + match.index);
  }

  for (const match of source.text.matchAll(
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

// Config-level findings for one app, plus any extra file (a worker entry
// outside src) whose source must also be scanned.
function configFindings(root, app, advisory, { config, adapter }) {
  if (advisory === SLOT) return { findings: [], paths: [] };
  if (!config) {
    return {
      findings: [
        {
          rule: "astro_config_missing",
          file: `apps/${app}/astro.config.mjs`,
          line: 1,
        },
      ],
      paths: [],
    };
  }
  if (advisory === IMAGE)
    return { findings: imageConfigFindings(config, adapter), paths: [] };

  const findings = adapter?.cloudflare
    ? []
    : [
        {
          rule: "adapter_not_cloudflare",
          file: config.file,
          line: adapter?.line ?? 1,
        },
      ];
  const entry = workerEntryFindings(root, app, config, adapter);
  return {
    findings: [...findings, ...entry.findings],
    paths: entry.path ? [entry.path] : [],
  };
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

  const sources = new Map();
  const sourcesAt = (paths) =>
    paths.map((path) => {
      if (!sources.has(path)) sources.set(path, readSource(root, path));
      return sources.get(path);
    });
  const contexts = new Map();
  const contextFor = (app) => {
    if (!contexts.has(app)) {
      const config = readConfig(root, app);
      contexts.set(app, {
        config,
        adapter: config ? adapterOf(config) : null,
        paths: listSourceFiles(join(root, "apps", app, "src")),
      });
    }
    return contexts.get(app);
  };
  let packageNames = [];
  try {
    packageNames = readdirSync(join(root, "packages")).sort();
  } catch {
    // A checkout without workspace packages has nothing shared to scan.
  }
  const sharedPaths = packageNames.flatMap((name) =>
    listSourceFiles(join(root, "packages", name, "src")),
  );

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
      const configured = configFindings(root, app, advisory, context);
      record(advisory, app, configured.findings);
      const paths = [...new Set([...context.paths, ...configured.paths])];
      for (const source of sourcesAt(paths))
        record(advisory, app, scan(source));
    }

    // Workspace packages compile into both apps, so they stay guarded while
    // any app remains below the fixed version.
    if (!active) continue;
    for (const source of sourcesAt(sharedPaths))
      record(advisory, "shared", scan(source));
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
