import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEV_HOST, parsePortOverride } from "./dev-server-ports.mjs";

/** Resolve Astro from the selected app, retaining its config and integrations. */
export async function loadAppAstro(appRoot) {
  const require = createRequire(join(appRoot, "package.json"));
  return import(pathToFileURL(require.resolve("astro")).href);
}

export async function startManagedAstro(
  appRoot,
  port,
  loadAstro = loadAppAstro,
) {
  const { dev } = await loadAstro(appRoot);
  const server = await dev({
    root: pathToFileURL(`${appRoot}/`),
    server: { host: DEV_HOST, port, open: false },
    vite: { server: { strictPort: true } },
  });
  if (server.address?.address !== DEV_HOST || server.address?.port !== port) {
    await server.stop();
    throw new Error(
      `Managed Astro must listen on ${DEV_HOST}:${port}; refused its actual address`,
    );
  }
  return server;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  let server;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await server?.stop();
    process.exit(0);
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    if (process.argv[2] !== "--port")
      throw new Error("Expected --port for managed Astro");
    const port = parsePortOverride("managed Astro port", process.argv[3]);
    if (port === null)
      throw new Error("Managed Astro requires an explicit port");
    server = await startManagedAstro(process.cwd(), port);
    process.send?.({ type: "listening", host: DEV_HOST, port }, () =>
      process.disconnect(),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
