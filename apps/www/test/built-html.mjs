import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

// Shared by tests that run after the www build and read emitted markup.
export const dist = fileURLToPath(new URL("../dist/", import.meta.url));

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

/** Markup without comments, script bodies or style bodies. */
function markup(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
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

/** Client script text shipped with a page: inline bodies plus bundled sources. */
export function clientScripts(html) {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs]) => !/type="application\/ld\+json"/.test(attrs))
    .map(([, attrs, body]) => {
      const src = attrs.match(/\ssrc="(\/_astro\/[^"]+)"/)?.[1];
      return src ? readFileSync(join(dist, src), "utf8") : body;
    });
}
