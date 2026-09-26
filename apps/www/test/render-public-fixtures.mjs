/** Capture the actual built Worker as deployed (CONTENT_RUNTIME "cms") over an
 * empty synthetic content store, so every route renders the bundled Git
 * defaults. These are test artifacts, never deployed static fallbacks. Linked
 * assets retain existing HTML/CSS guards. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  buildDir,
  renderedDir,
  serve,
  workerEntry,
} from "./worker-runtime.mjs";
import { contentDatabase, contentEnv } from "./content-database.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const content = join(root, "content/public");
function routes(kind, prefix, visible) {
  return readdirSync(join(content, kind))
    .filter((name) => name.endsWith(".md"))
    .flatMap((name) => {
      const source = readFileSync(join(content, kind, name), "utf8");
      const data = parse(
        source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "",
      );
      return visible(data)
        ? [`/${prefix}/${data.slug ?? name.slice(0, -3)}`]
        : [];
    });
}
const paths = [
  "/",
  "/writing",
  "/work",
  "/systems",
  "/feed.xml",
  "/sitemap.xml",
  "/search-index.json",
  ...routes("writing", "writing", (data) => data.status === "published"),
  ...routes("projects", "work", (data) =>
    ["listed", "featured"].includes(data.public_state),
  ),
];
rmSync(renderedDir, { recursive: true, force: true });
function linkAssets(from, into) {
  mkdirSync(into, { recursive: true });
  for (const item of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, item.name),
      target = join(into, item.name);
    if (item.isDirectory()) linkAssets(source, target);
    else symlinkSync(source, target);
  }
}
linkAssets(buildDir, renderedDir);
const env = contentEnv(contentDatabase());
for (const path of paths) {
  const response = await serve(path, env);
  assert.equal(response.status, 200, `render ${path}`);
  assert.equal(response.headers.get("x-content-version"), "0", path);
  const name =
    path === "/"
      ? "index.html"
      : /\.(?:json|xml)$/.test(path)
        ? path.slice(1)
        : `${path.slice(1)}.html`;
  const output = join(renderedDir, name);
  mkdirSync(dirname(output), { recursive: true });
  assert.equal(
    existsSync(output),
    false,
    `Runtime route must not already exist in deploy assets: ${path}`,
  );
  writeFileSync(output, await response.text());
}
writeFileSync(
  join(renderedDir, ".runtime-proof.json"),
  JSON.stringify({
    workerSha256: createHash("sha256")
      .update(readFileSync(workerEntry))
      .digest("hex"),
    paths,
  }),
);
console.log(
  `Rendered ${paths.length} public Worker responses for markup verification (outside deploy assets).`,
);
