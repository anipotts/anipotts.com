import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withWorkerEnv } from "./cloudflare-workers.mjs";

/** Deploy assets. The adapter emits them to dist/client and the Worker to
 * dist/server; wrangler deploys both through dist/server/wrangler.json. */
export const buildDir = fileURLToPath(
  new URL("../dist/client/", import.meta.url),
);
export const workerEntry = fileURLToPath(
  new URL("../dist/server/entry.mjs", import.meta.url),
);
export const renderedDir = fileURLToPath(
  new URL("../.local/public-rendered/", import.meta.url),
);
export const worker = withWorkerEnv((await import(workerEntry)).default);
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

/** Start the emitted Worker again over a manifest carrying stale assets, as
 * a future code deployment could still bundle media referenced by an
 * unpublished Git record. The manifest is a shared module; a fresh instance of
 * the entry reruns its startup against it. */
let fresh = 0;
export async function workerWithManifestAssets(paths) {
  const entry = readFileSync(workerEntry, "utf8");
  const chunk = entry.match(
    /import \{[^}]*\b(\w+) as manifest\b[^}]*\} from "([^"]+)"/,
  );
  if (!chunk) throw new Error("built_worker_manifest_not_found");
  const { [chunk[1]]: manifest } = await import(
    new URL(chunk[2], pathToFileURL(workerEntry)).href
  );
  for (const path of paths) manifest.assets.add(path);
  const url = pathToFileURL(workerEntry);
  url.searchParams.set("stale-assets", String(++fresh));
  return withWorkerEnv((await import(url.href)).default);
}
