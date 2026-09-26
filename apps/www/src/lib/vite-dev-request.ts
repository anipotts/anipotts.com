/** Development only. wrangler.toml sets `run_worker_first = true`, so under
 * astro dev the Cloudflare Vite plugin sends every request to the Worker,
 * including Vite's own module, client and HMR URLs. In dev the ASSETS binding
 * is Vite's middleware, so those requests go straight there. Builds never
 * call this: both Worker entries guard it with `import.meta.env.DEV`. */
const VITE_PREFIXES = [
  "/@vite/",
  "/@id/",
  "/@fs/",
  "/@react-refresh",
  "/__vite",
  "/node_modules/",
  "/src/",
];
// Module scripts and styles Vite serves by absolute file path, such as a
// hydrated island. Images stay with the Worker: draft media is a route.
const MODULE_DESTINATIONS = new Set([
  "script",
  "style",
  "font",
  "worker",
  "sharedworker",
  "serviceworker",
]);

export function isViteDevRequest(request: {
  url: string;
  method: string;
  headers: { get(name: string): string | null };
}): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const { pathname } = new URL(request.url);
  return (
    VITE_PREFIXES.some((prefix) => pathname.startsWith(prefix)) ||
    MODULE_DESTINATIONS.has(request.headers.get("sec-fetch-dest") ?? "")
  );
}
