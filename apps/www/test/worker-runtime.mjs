import { readFileSync, existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

export const buildDir = fileURLToPath(new URL("../dist/", import.meta.url));
export const renderedDir = fileURLToPath(
  new URL("../.local/public-rendered/", import.meta.url),
);
registerHooks({
  resolve(specifier, context, next) {
    return specifier === "cloudflare:workers"
      ? {
          url: "data:text/javascript,export const env = {};",
          shortCircuit: true,
        }
      : next(specifier, context);
  },
});
globalThis.caches ??= {};
export const worker = (await import(join(buildDir, "_worker.js/index.js")))
  .default;
export const executionContext = { waitUntil() {}, passThroughOnException() {} };
const types = {
  ".html": "text/html",
  ".json": "application/json",
  ".xml": "application/xml",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
export function fileAssets(directory = buildDir) {
  return {
    async fetch(input) {
      const request = input instanceof Request ? input : new Request(input);
      const pathname = decodeURIComponent(new URL(request.url).pathname);
      if (pathname.startsWith("/_worker.js"))
        return new Response(null, { status: 404 });
      const name = pathname === "/" ? "index" : pathname.slice(1);
      for (const candidate of [name, `${name}.html`, `${name}/index.html`]) {
        const path = join(directory, candidate);
        if (existsSync(path) && statSync(path).isFile()) {
          return new Response(
            request.method === "HEAD" ? null : readFileSync(path),
            {
              headers: {
                "Content-Type":
                  types[extname(path)] ?? "application/octet-stream",
              },
            },
          );
        }
      }
      return new Response(null, { status: 404 });
    },
  };
}
export function serve(path, env = {}, init) {
  return worker.fetch(
    new Request(`https://anipotts.com${path}`, init),
    { ASSETS: fileAssets(), ...env },
    executionContext,
  );
}

/** Reuse the emitted entry factory with stale manifest assets, as a future code
 * deployment could still bundle media referenced by an unpublished Git record. */
export async function workerWithManifestAssets(paths) {
  const entry = readFileSync(join(buildDir, "_worker.js/index.js"), "utf8");
  const factory = entry.match(
    /import \{ (\w+) as createExports[^}]*\} from '([^']+)'/,
  );
  const manifestFile = entry.match(/import \{ manifest \} from '([^']+)'/);
  if (!factory || !manifestFile)
    throw new Error("built_worker_factory_not_found");
  const { manifest } = await import(
    join(buildDir, "_worker.js", manifestFile[1])
  );
  const exports = await import(join(buildDir, "_worker.js", factory[2]));
  return exports[factory[1]]({
    ...manifest,
    assets: new Set([...manifest.assets, ...paths]),
  }).default;
}
