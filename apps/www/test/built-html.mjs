import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

// Shared by tests reading actual built-Worker responses captured outside deploy assets.
export const dist = fileURLToPath(
  new URL("../.local/public-rendered/", import.meta.url),
);

const proof = JSON.parse(
  readFileSync(join(dist, ".runtime-proof.json"), "utf8"),
);
assert.equal(
  proof.workerSha256,
  createHash("sha256")
    .update(
      readFileSync(new URL("../dist/_worker.js/index.js", import.meta.url)),
    )
    .digest("hex"),
  "Rendered fixtures must match the current built Worker",
);

export function builtPages(dir = dist) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name.startsWith("_") ? [] : builtPages(path);
    return entry.name.endsWith(".html")
      ? [{ path: `/${relative(dist, path)}`, html: readFileSync(path, "utf8") }]
      : [];
  });
}

const entities = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">" };
const decode = (value) =>
  value.replace(/&(amp|quot|apos|lt|gt|#39);/g, (_, name) =>
    name === "#39" ? "'" : entities[name],
  );

const rawTextEnd = {
  script: /<\/script\b[^>]*>/gi,
  style: /<\/style\b[^>]*>/gi,
};

/** Markup without comments, script bodies or style bodies, skipped in one forward scan. */
function markup(html) {
  let out = "";
  let at = 0;
  while (at < html.length) {
    const open = html.indexOf("<", at);
    if (open === -1) return out + html.slice(at);
    out += html.slice(at, open);
    if (html.startsWith("<!--", open)) {
      const close = html.indexOf("-->", open + 4);
      at = close === -1 ? html.length : close + 3;
      continue;
    }
    const raw = /^<(script|style)\b/i.exec(html.slice(open, open + 8))?.[1];
    if (!raw) {
      out += "<";
      at = open + 1;
      continue;
    }
    const end = rawTextEnd[raw.toLowerCase()];
    end.lastIndex = open;
    const match = end.exec(html);
    at = match ? match.index + match[0].length : html.length;
  }
  return out;
}

export function startTags(html) {
  const tag =
    /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
  const attribute =
    /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  return [...markup(html).matchAll(tag)].map(([source, name, attrs]) => ({
    source,
    name: name.toLowerCase(),
    attributes: Object.fromEntries(
      [...attrs.matchAll(attribute)].map(([, key, a, b, c]) => [
        key.toLowerCase(),
        decode(a ?? b ?? c ?? ""),
      ]),
    ),
  }));
}

/** A bundled entry plus every relative chunk it imports, so shared chunks are scanned too. */
function bundle(path, seen) {
  if (seen.has(path)) return [];
  seen.add(path);
  const source = readFileSync(path, "utf8");
  const imports = source.matchAll(
    /\b(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+\.js)["']/g,
  );
  return [
    source,
    ...[...imports].flatMap(([, chunk]) =>
      bundle(join(dirname(path), chunk), seen),
    ),
  ];
}

/** Client script text shipped with a page: inline bodies plus bundled sources. */
export function clientScripts(html) {
  const seen = new Set();
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi)]
    .filter(([, attrs]) => !/type="application\/ld\+json"/.test(attrs))
    .flatMap(([, attrs, body]) => {
      const src = attrs.match(/\ssrc="(\/_astro\/[^"]+)"/)?.[1];
      return src ? bundle(join(dist, src), seen) : [body];
    });
}
