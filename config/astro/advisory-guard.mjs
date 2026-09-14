// Build-time guard for three Astro 5 advisories that are unreachable in these
// workers today. It inspects the resolved Astro config and Vite's real module
// graph during every build and dev server, so it never parses source
// text beyond two raw `.astro` slot patterns. Each rule turns itself off once
// the installed astro reaches that advisory's first fixed version.
//
// Evidence and removal: docs/security/astro-advisory-exposure.md. Delete this
// module, its test and both astro.config.mjs entries after the Astro 7 upgrade.

import { readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const GUARD_NAME = "anipotts:astro-advisory-guard";
const EXPOSURE_DOC = "docs/security/astro-advisory-exposure.md";

export const SHARP_DECODING = "GHSA-26w7-cxv4-gfx2";
export const ERROR_PAGE_SSRF = "GHSA-2pvr-wf23-7pc7";
export const SLOT_NAME_XSS = "GHSA-8hv8-536x-4wqp";

export const FIRST_FIXED = {
  [SHARP_DECODING]: "7.2.8",
  [ERROR_PAGE_SSRF]: "6.4.6",
  [SLOT_NAME_XSS]: "6.3.3",
};

export const CLOUDFLARE_ADAPTER = "@astrojs/cloudflare";
export const PASSTHROUGH_IMAGE_SERVICE = "astro/assets/services/noop";

const DEFAULT_REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const GUARDED_SOURCE = /^(?:apps|packages)\/[^/]+\/src\//;
// Only files whose imports an author writes are checked. Astro compiles other
// sources into modules with its own imports: `.md` pages import
// `astro:assets` for images and `.svg` files import `astro/assets/runtime`.
const AUTHORED_MODULE = /\.(?:astro|mdx|[cm]?[jt]sx?)$/;

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?/.exec(
    String(version).trim(),
  );
  if (!match) return null;
  return {
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: Boolean(match[4]),
  };
}

// True when `installed` is at or past `fixed`. A prerelease of the fixed
// version is still below it, and an unreadable version is never past it.
export function reachesVersion(installed, fixed) {
  const have = parseVersion(installed);
  const need = parseVersion(fixed);
  if (!have || !need) return false;
  for (let index = 0; index < 3; index += 1) {
    if (have.parts[index] !== need.parts[index])
      return have.parts[index] > need.parts[index];
  }
  return !have.prerelease;
}

export function activeAdvisories(astroVersion) {
  return new Set(
    Object.entries(FIRST_FIXED)
      .filter(([, fixed]) => !reachesVersion(astroVersion, fixed))
      .map(([advisory]) => advisory),
  );
}

export function installedAstroVersion(root) {
  try {
    const require = createRequire(new URL("package.json", root));
    const manifest = require.resolve("astro/package.json");
    return JSON.parse(readFileSync(manifest, "utf8")).version ?? null;
  } catch {
    return null;
  }
}

function describe(advisories, message, hint) {
  const ids = [advisories].flat();
  const fixed = ids.map((id) => `${id} in astro ${FIRST_FIXED[id]}`);
  return {
    advisories: ids,
    message: `${ids.join(", ")}: ${message}`,
    hint: `${hint} (fixed upstream: ${fixed.join(", ")}; see ${EXPOSURE_DOC})`,
  };
}

export function checkResolvedConfig(config, active) {
  const findings = [];
  const adapterAdvisories = [ERROR_PAGE_SSRF, SHARP_DECODING].filter((id) =>
    active.has(id),
  );
  const adapter = config?.adapter?.name;
  if (adapterAdvisories.length > 0 && adapter !== CLOUDFLARE_ADAPTER) {
    findings.push(
      describe(
        adapterAdvisories,
        `resolved adapter is ${JSON.stringify(adapter ?? null)}, not ${CLOUDFLARE_ADAPTER}.`,
        `Keep adapter: cloudflare({ imageService: "passthrough" }) from ${CLOUDFLARE_ADAPTER}.`,
      ),
    );
  }
  if (!active.has(SHARP_DECODING)) return findings;
  const image = config?.image ?? {};
  const entrypoint = image.service?.entrypoint;
  if (entrypoint !== PASSTHROUGH_IMAGE_SERVICE) {
    findings.push(
      describe(
        SHARP_DECODING,
        `resolved image service is ${JSON.stringify(entrypoint ?? null)}, not ${PASSTHROUGH_IMAGE_SERVICE}.`,
        'Set imageService: "passthrough" in the cloudflare adapter options and remove any image.service override.',
      ),
    );
  }
  for (const key of ["domains", "remotePatterns"]) {
    const value = image[key];
    if (value === undefined || (Array.isArray(value) && value.length === 0))
      continue;
    findings.push(
      describe(
        SHARP_DECODING,
        `image.${key} allows remote image sources.`,
        `Remove image.${key} and link remote images with a plain <img>.`,
      ),
    );
  }
  return findings;
}

export class AstroAdvisoryError extends Error {
  constructor(findings) {
    super(findings.map((finding) => finding.message).join("\n"));
    this.name = "AstroAdvisoryError";
    this.title = "Astro advisory guard";
    this.hint = findings.map((finding) => finding.hint).join("\n");
    this.advisories = [
      ...new Set(findings.flatMap((finding) => finding.advisories)),
    ];
  }
}

export function importAdvisory(source, active) {
  if (typeof source !== "string") return null;
  if (
    active.has(SHARP_DECODING) &&
    (source === "astro:assets" ||
      source === "astro/assets" ||
      source === "astro/assets/services/sharp" ||
      source === "sharp" ||
      source.startsWith("sharp/"))
  )
    return SHARP_DECODING;
  if (
    active.has(ERROR_PAGE_SSRF) &&
    (source === "astro/app" || source.startsWith("astro/app/"))
  )
    return ERROR_PAGE_SSRF;
  return null;
}

// Returns the repository-relative path of a real file under apps/*/src or
// packages/*/src, after resolving symlinks, or null for anything else:
// virtual ids, node_modules, generated `.astro` directories and missing files.
export function guardedSource(id, repoRoot) {
  if (typeof id !== "string" || id.includes("\0")) return null;
  let path = id.replace(/[?#].*$/, "");
  if (path.startsWith("/@fs/")) path = path.slice("/@fs".length);
  if (!isAbsolute(path)) return null;
  let absolute;
  try {
    absolute = realpathSync(path);
    if (!statSync(absolute).isFile()) return null;
  } catch {
    return null;
  }
  const file = relative(repoRoot, absolute).split(sep).join("/");
  if (file.startsWith("../") || isAbsolute(file)) return null;
  if (!GUARDED_SOURCE.test(file)) return null;
  if (file.split("/").includes("node_modules")) return null;
  return { file, absolute };
}

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

// Frontmatter is TypeScript and cannot hold markup, so it is blanked before
// the attribute match; offsets and line numbers stay intact. A declaration such
// as `const slot = {}` in a client script is also not an attribute.
const FRONTMATTER = /^\s*---[^\S\r\n]*\r?\n(?:[\s\S]*?\r?\n)?---/;
const SLOT_ATTRIBUTE =
  /(?<![\w$.:-])(?<!\b(?:const|let|var)\s+)slot\s*=\s*([{`])/g;
const LITERAL_EXPRESSION = /^\{\s*(?:"[^"\\\r\n]*"|'[^'\\\r\n]*')\s*\}/;
const LITERAL_TEMPLATE = /^`[^`$\\]*`/;
const SLOT_LOOKUP = /\bAstro\s*\??\.\s*slots\s*\??\.\s*(render|has)\s*\(/g;
const LITERAL_ARGUMENT =
  /^\s*(?:"[^"\\\r\n]*"|'[^'\\\r\n]*'|`[^`$\\]*`)\s*[,)]/;

// Deliberately simple and fail-closed: any slot name that is not a plain
// string literal fails, including a ternary between two literals.
export function findSlotViolations(source) {
  const findings = [];
  const markup = source.replace(FRONTMATTER, (block) =>
    block.replace(/[^\r\n]/g, " "),
  );
  for (const match of markup.matchAll(SLOT_ATTRIBUTE)) {
    const value = markup.slice(match.index + match[0].length - 1);
    const literal =
      match[1] === "{"
        ? LITERAL_EXPRESSION.test(value)
        : LITERAL_TEMPLATE.test(value);
    if (literal) continue;
    findings.push({
      advisory: SLOT_NAME_XSS,
      line: lineOf(source, match.index),
      message: "slot attribute value is not a string literal",
    });
  }
  for (const match of source.matchAll(SLOT_LOOKUP)) {
    const argument = source.slice(match.index + match[0].length);
    if (LITERAL_ARGUMENT.test(argument)) continue;
    findings.push({
      advisory: SLOT_NAME_XSS,
      line: lineOf(source, match.index),
      message: `Astro.slots.${match[1]} name is not a string literal`,
    });
  }
  return findings;
}

export function advisoryGuardVitePlugin({
  active,
  repoRoot = DEFAULT_REPO_ROOT,
  readFile = (path) => readFileSync(path, "utf8"),
}) {
  const root = realpathSync(repoRoot);
  return {
    name: GUARD_NAME,
    enforce: "pre",
    resolveId(source, importer) {
      const advisory = importAdvisory(source, active);
      if (!advisory) return null;
      const importing = guardedSource(importer, root);
      if (!importing || !AUTHORED_MODULE.test(importing.file)) return null;
      this.error(
        `${advisory}: ${importing.file} imports ${JSON.stringify(source)}, which is blocked until astro ${FIRST_FIXED[advisory]}. ` +
          (advisory === SHARP_DECODING
            ? "Fix: serve the image from public/ with a plain <img>, or use import type for types only."
            : "Fix: render through the @astrojs/cloudflare handler instead of astro/app.") +
          ` See ${EXPOSURE_DOC}.`,
      );
    },
    transform(_code, id) {
      if (!active.has(SLOT_NAME_XSS)) return null;
      if (typeof id !== "string" || /[?#]/.test(id) || !id.endsWith(".astro"))
        return null;
      const target = guardedSource(id, root);
      if (!target) return null;
      // Read the file itself: Astro's own pre plugin may already have compiled
      // `_code`, and the raw template is what carries the slot attribute.
      const findings = findSlotViolations(readFile(target.absolute));
      if (findings.length === 0) return null;
      this.error(
        findings
          .map(
            (finding) =>
              `${finding.advisory}: ${target.file}:${finding.line} ${finding.message}.`,
          )
          .join("\n") +
          ` Fix: use a literal slot name and pass request data as a prop. See ${EXPOSURE_DOC}.`,
      );
    },
  };
}

export default function astroAdvisoryGuard(options = {}) {
  let active = null;
  const resolveActive = (config) => {
    if (active) return active;
    const version =
      options.astroVersion ?? installedAstroVersion(config?.root ?? "");
    active = activeAdvisories(version);
    return active;
  };
  return {
    name: GUARD_NAME,
    hooks: {
      "astro:config:setup": ({ config, updateConfig }) => {
        const rules = resolveActive(config);
        // Every advisory is fixed in the installed astro: stay silent.
        if (rules.size === 0) return;
        updateConfig({
          vite: {
            plugins: [
              advisoryGuardVitePlugin({
                active: rules,
                repoRoot: options.repoRoot,
                readFile: options.readFile,
              }),
            ],
          },
        });
      },
      "astro:config:done": ({ config }) => {
        const findings = checkResolvedConfig(config, resolveActive(config));
        if (findings.length > 0) throw new AstroAdvisoryError(findings);
      },
    },
  };
}
